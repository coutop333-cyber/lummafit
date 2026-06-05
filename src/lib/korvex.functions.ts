import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader, getRequestIP } from '@tanstack/react-start/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { sendUtmifyOrder } from '@/lib/utmify.server';

const KORVEX_BASE = 'https://app.korvex.com.br/api/v1';

function getKorvexHeaders(): Record<string, string> {
  const pub = process.env.KORVEX_PUBLIC_KEY?.trim();
  const sec = process.env.KORVEX_SECRET_KEY?.trim();
  if (!pub || !sec) {
    throw new Error('KORVEX_PUBLIC_KEY / KORVEX_SECRET_KEY não configurados.');
  }
  return {
    'x-public-key': pub,
    'x-secret-key': sec,
    'Content-Type': 'application/json',
  };
}

function getWebhookUrl(): string {
  const raw =
    process.env.KORVEX_WEBHOOK_BASE_URL?.trim() ||
    process.env.VENOPAG_WEBHOOK_BASE_URL?.trim() ||
    'https://copadasfigurinhas.com';
  // Remove backticks, aspas ou espaços que possam ter sido salvos por engano
  const base = raw.replace(/[`'"]/g, '').replace(/\/+$/, '');
  return `${base}/api/public/korvex-webhook`;
}

// ============ Warm ============
export const warmKorvexPix = createServerFn({ method: 'POST' }).handler(async () => {
  return { ok: true };
});

// ============ Schemas ============
const trackingSchema = z
  .object({
    utms: z.record(z.string(), z.string()).optional(),
    name: z.string().max(120).optional(),
    email: z.string().email().max(120).optional(),
    phone: z.string().max(40).optional(),
    fbp: z.string().max(200).optional(),
    fbc: z.string().max(200).optional(),
    fbclid: z.string().max(200).optional(),
    referrer: z.string().max(2048).optional(),
    landing_url: z.string().max(2048).optional(),
    user_agent: z.string().max(500).optional(),
    first_seen_at: z.string().max(40).optional(),
  })
  .partial();

const createInput = z.object({
  kitId: z.number().int().min(1).max(99),
  title: z.string().trim().min(3).max(255),
  unitPrice: z.number().positive().min(1).max(10000),
  externalReference: z
    .string()
    .trim()
    .min(8)
    .max(120)
    .refine((v) => !/^(null|undefined|nan)$/i.test(v), 'externalReference inválido'),
  payerEmail: z.string().email().max(120).optional(),
  payerName: z.string().max(160).optional(),
  payerPhone: z.string().max(40).optional(),
  payerDocument: z.string().max(20).optional(),
  tracking: trackingSchema.optional(),
  source: z.enum(['default', 'produto4', 'produto5']).optional(),
});

export const createKorvexPixPayment = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => createInput.parse(input))
  .handler(async ({ data }) => {
    const totalStartedAt = Date.now();
    const forwardedIp = getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim();
    const clientIp =
      getRequestIP({ xForwardedFor: true }) ||
      getRequestHeader('cf-connecting-ip') ||
      getRequestHeader('x-real-ip') ||
      forwardedIp ||
      null;
    const userAgent =
      getRequestHeader('user-agent') || data.tracking?.user_agent || null;
    const origin = getRequestHeader('origin') || getRequestHeader('referer') || null;

    const tracking = data.tracking ?? {};
    const trackingVazio =
      !tracking ||
      Object.keys(tracking).length === 0 ||
      ((!tracking.utms || Object.keys(tracking.utms || {}).length === 0) &&
        !tracking.fbp &&
        !tracking.fbc &&
        !tracking.fbclid &&
        !tracking.email &&
        !tracking.referrer &&
        !tracking.landing_url);

    const emailFake =
      typeof data.payerEmail === 'string' &&
      /cliente\+null@|cliente\+undefined@/i.test(data.payerEmail);

    const blockReasons: string[] = [];
    if (data.unitPrice < 1) blockReasons.push('amount < R$1,00');
    if (emailFake) blockReasons.push('email fake');
    if (!data.title || data.title.trim().length < 3) blockReasons.push('produto vazio');
    if (!data.externalReference || data.externalReference.trim().length < 8)
      blockReasons.push('external_reference vazio');
    if (trackingVazio) blockReasons.push('tracking_payload vazio');
    if (
      !userAgent ||
      /^(curl|wget|node|python|axios|go-http|healthcheck|bot)/i.test(userAgent)
    ) {
      blockReasons.push(`user_agent inválido: ${userAgent || 'null'}`);
    }

    if (blockReasons.length) {
      console.error('[korvex-create][BLOQUEIO]', { motivos: blockReasons, origin });
      throw new Error(`Pagamento bloqueado: ${blockReasons.join('; ')}`);
    }

    // Persistir pedido no banco ANTES de chamar Korvex
    const pedidoId = data.externalReference;
    const trackingToSave = { ...(data.tracking ?? {}), _source: data.source || 'produto5', _venopag_source: data.source || 'produto5' } as any;

    const { error: insertErr } = await supabaseAdmin
      .from('orders')
      .upsert(
        {
          external_reference: data.externalReference,
          kit_id: data.kitId,
          kit_title: data.title,
          amount: Number(data.unitPrice.toFixed(2)),
          status: 'pending',
          tracking_payload: trackingToSave,
          client_ip: clientIp,
          client_user_agent: userAgent,
        } as any,
        { onConflict: 'external_reference' },
      );

    if (insertErr) {
      console.error('[korvex-create] erro ao persistir pedido', insertErr);
      throw new Error('Não foi possível registrar o pedido. Tente novamente.');
    }

    // URL FIXA — sem ?ref= para não criar um novo webhook por pedido (limite de 20)
    // O pedido é identificado pelo campo identifier + transactionId no webhook
    const webhookUrl = getWebhookUrl();

    // Formata campos para a Korvex
    const rawPhone = data.payerPhone || tracking.phone || '';
    const rawDoc = data.payerDocument || '';
    // CPF formatado com pontos e traço: 000.000.000-00
    const cpfDigits = rawDoc.replace(/\D/g, '');
    const cpfFormatted = cpfDigits.length === 11
      ? cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      : rawDoc;
    // Identificador curto (max 50 chars, só alfanumérico e hífen)
    const identifier = pedidoId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);

    const body = {
      identifier,
      amount: Number(data.unitPrice.toFixed(2)),
      client: {
        name: (data.payerName || tracking.name || 'Cliente').slice(0, 100),
        email: data.payerEmail || tracking.email || undefined,
        phone: rawPhone || '(00) 00000-0000', // Korvex exige phone obrigatório
        document: cpfFormatted || undefined,
      },
      products: [
        {
          id: String(data.kitId),
          name: data.title.slice(0, 100),
          quantity: 1,
          price: Number(data.unitPrice.toFixed(2)),
        },
      ],
      callbackUrl: webhookUrl,
      metadata: { externalReference: pedidoId },
    };

    let upstream: any = null;
    let httpStatus = 0;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`${KORVEX_BASE}/gateway/pix/receive`, {
        method: 'POST',
        headers: getKorvexHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      httpStatus = res.status;
      const text = await res.text();
      try {
        upstream = JSON.parse(text);
      } catch {
        upstream = { raw: text };
      }
      if (!res.ok) {
        console.error('[korvex-create][ERROR]', {
          httpStatus,
          message: upstream?.message,
          details: upstream?.details,
          errorCode: upstream?.errorCode,
          body_sent: JSON.stringify(body),
          response: upstream,
        });
        // Monta mensagem legível incluindo details se existir
        const details = upstream?.details
          ? (Array.isArray(upstream.details)
              ? upstream.details.map((d: any) => d?.message || JSON.stringify(d)).join(', ')
              : JSON.stringify(upstream.details))
          : null;
        const msg = upstream?.message || upstream?.error || `HTTP ${httpStatus}`;
        throw new Error(`Falha ao gerar Pix (Korvex): ${msg}${details ? ` — ${details}` : ''}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isAbort = (err as any)?.name === 'AbortError' || /aborted|abort/i.test(msg);
      if (isAbort) {
        throw new Error('A geração do Pix demorou mais que o esperado. Tente novamente.');
      }
      throw new Error(msg.startsWith('Falha') ? msg : `Falha ao gerar Pix: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }

    // Extrair campos da resposta Korvex
    const transactionId: string = upstream?.transactionId || '';
    const orderId: string = upstream?.order?.id || '';
    const pixCode: string = upstream?.pix?.code || '';
    // base64 pode vir como data URL completa "data:image/png;base64,..."
    const rawBase64: string = upstream?.pix?.base64 || upstream?.pix?.image || '';
    let pixBase64: string = rawBase64.startsWith('data:')
      ? rawBase64.split(',')[1] || ''
      : rawBase64;

    if (!transactionId || !pixCode) {
      console.error('[korvex-create][INCOMPLETO]', upstream);
      throw new Error('Korvex retornou cobrança incompleta.');
    }

    // Gerar QR base64 local se a Korvex não retornou
    if (!pixBase64 && pixCode) {
      try {
        const QRCode = (await import('qrcode')).default;
        const dataUrl = await QRCode.toDataURL(pixCode, { margin: 1, width: 320 });
        pixBase64 = dataUrl.split(',')[1] || '';
      } catch (e) {
        console.error('[korvex-create] erro ao gerar QR base64', e);
      }
    }

    // Salvar dados Korvex no banco (reaproveitando colunas efi_*)
    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({
        efi_txid: transactionId,       // korvex_transaction_id
        efi_loc_id: orderId,           // korvex_order_id
        efi_qrcode: pixBase64 || null,
        efi_copia_cola: pixCode,
        efi_expires_at: null,
        efi_status: 'PENDING',
        efi_payload: upstream as any,
      } as any)
      .eq('external_reference', data.externalReference);

    if (updateErr) {
      console.error('[korvex-create] erro ao salvar dados', updateErr);
      throw new Error('Pix gerado, mas não foi possível registrar o vínculo do pedido.');
    }

    console.log('[korvex-create][OK]', {
      pedidoId,
      transactionId,
      orderId,
      total_ms: Date.now() - totalStartedAt,
    });

    // ===== UTMify: waiting_payment (PIX gerado) =====
    try {
      const { data: orderFull } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('external_reference', data.externalReference)
        .maybeSingle();

      if (orderFull) {
        const result = await sendUtmifyOrder(orderFull, { status: 'waiting_payment' });
        console.log('[korvex-create][UTMify-waiting]', {
          ok: result.ok,
          httpStatus: result.httpStatus,
          responseBody: result.responseBody,
        });
      }
    } catch (err) {
      console.error('[korvex-create][UTMify-waiting] erro', err);
    }

    return {
      id: transactionId,
      txid: transactionId,
      status: 'pending',
      qr_code: pixCode,
      qr_code_base64: pixBase64,
      ticket_url: upstream?.order?.url || '',
      external_reference: data.externalReference,
      transaction_amount: Number(data.unitPrice.toFixed(2)),
      expires_at: null,
    };
  });

// ============ Polling de status via Supabase ============
const statusInput = z.object({ txid: z.string().min(4).max(120) });

export const getKorvexPaymentStatus = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => statusInput.parse(input))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, status, amount, external_reference, efi_status, efi_txid, created_at, tracking_payload')
      .eq('efi_txid', data.txid)
      .maybeSingle();

    if (!order) {
      return { status: 'pending', external_reference: undefined, transaction_amount: 0 };
    }

    const internal = String(order.status || '').toLowerCase();
    const gw = String((order as any).efi_status || '').toUpperCase();

    const isPaid =
      internal === 'approved' || internal === 'paid' || internal === 'pago' ||
      gw === 'CONFIRMED' || gw === 'PAID' || gw === 'APPROVED' || gw === 'OK';

    const isFailed =
      internal === 'rejected' || internal === 'cancelled' || internal === 'canceled' ||
      gw === 'EXPIRED' || gw === 'CANCELLED';

    // ===== FALLBACK: consulta Korvex diretamente se ainda pendente =====
    if (!isPaid && !isFailed) {
      try {
        const korvexStatus = await consultKorvexTransaction(data.txid);
        console.log('[korvex-status][fallback]', { txid: data.txid, status: korvexStatus.status });

        if (korvexStatus.status === 'confirmed') {
          // Atualiza o banco e dispara o webhook interno para processar UTMify + Meta
          await supabaseAdmin
            .from('orders')
            .update({ status: 'paid', efi_status: 'CONFIRMED', approved_at: new Date().toISOString() } as any)
            .eq('id', order.id);

          // Dispara o webhook interno para processar integrações
          try {
            const base = process.env.KORVEX_WEBHOOK_BASE_URL?.replace(/[`'"]/g, '').replace(/\/+$/, '') || 'https://copadasfigurinhas.com';
            await fetch(`${base}/api/public/korvex-webhook?ref=${order.external_reference}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: 'TRANSACTION_PAID', status: 'ok', transactionId: data.txid }),
            });
          } catch (e) {
            console.error('[korvex-status][fallback] erro ao acionar webhook interno', e);
          }

          return {
            status: 'approved',
            external_reference: order.external_reference || undefined,
            transaction_amount: Number(order.amount || 0),
          };
        }

        if (korvexStatus.status === 'expired') {
          await supabaseAdmin.from('orders').update({ efi_status: 'EXPIRED' } as any).eq('id', order.id);
          return { status: 'rejected', external_reference: order.external_reference || undefined, transaction_amount: 0 };
        }
      } catch (err) {
        console.error('[korvex-status][fallback] erro ao consultar Korvex', err);
      }
    }

    return {
      status: isPaid ? 'approved' : isFailed ? 'rejected' : 'pending',
      external_reference: order.external_reference || undefined,
      transaction_amount: Number(order.amount || 0),
    };
  });

// ============ Consulta direta na Korvex ============
export async function consultKorvexTransaction(transactionId: string): Promise<{
  status: 'pending' | 'confirmed' | 'expired' | 'unknown';
  raw: any;
}> {
  const pub = process.env.KORVEX_PUBLIC_KEY?.trim();
  const sec = process.env.KORVEX_SECRET_KEY?.trim();
  if (!pub || !sec) return { status: 'unknown', raw: null };

  try {
    const res = await fetch(`${KORVEX_BASE}/gateway/transactions?id=${encodeURIComponent(transactionId)}`, {
      method: 'GET',
      headers: { 'x-public-key': pub, 'x-secret-key': sec, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('[korvex-consult]', { transactionId, httpStatus: res.status, body: json });

    // Extrai status de qualquer campo possível na resposta
    const statusRaw = String(
      json?.status ||
      json?.transaction?.status ||
      json?.data?.status ||
      json?.payment?.status ||
      json?.pix?.status ||
      ''
    ).toLowerCase();

    const CONFIRMED = new Set(['ok', 'paid', 'approved', 'confirmed', 'completed', 'pago', 'concluido', 'success']);
    const EXPIRED = new Set(['expired', 'cancelled', 'canceled', 'failed', 'rejected', 'pending_expired']);

    if (CONFIRMED.has(statusRaw)) return { status: 'confirmed', raw: json };
    if (EXPIRED.has(statusRaw)) return { status: 'expired', raw: json };
    return { status: 'pending', raw: json };
  } catch (err) {
    console.error('[korvex-consult] erro', err);
    return { status: 'unknown', raw: null };
  }
}
