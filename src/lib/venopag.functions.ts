import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader, getRequestIP } from '@tanstack/react-start/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const VENOPAG_BASE = 'https://venopag.com';

export type VenopagSource = 'default' | 'produto4' | 'produto5';

function getVenopagAuthHeaders(source: VenopagSource = 'default'): Record<string, string> {
  const isSpecial = source === 'produto4' || source === 'produto5';
  const cid = isSpecial
    ? process.env.VENOPAG_CLIENT_ID_PRODUTO4?.trim()
    : process.env.VENOPAG_CLIENT_ID?.trim();
  const csec = isSpecial
    ? process.env.VENOPAG_CLIENT_SECRET_PRODUTO4?.trim()
    : process.env.VENOPAG_CLIENT_SECRET?.trim();
  if (!cid || !csec) {
    const suffix = isSpecial ? '_PRODUTO4' : '';
    throw new Error(`VENOPAG_CLIENT_ID${suffix} / VENOPAG_CLIENT_SECRET${suffix} não configurados.`);
  }
  return {
    'X-Client-Id': cid,
    'X-Client-Secret': csec,
    'Content-Type': 'application/json',
  };
}

function getWebhookUrl(): string {
  const base =
    process.env.VENOPAG_WEBHOOK_BASE_URL?.trim() ||
    'https://eletrojundiai.shop';
  return `${base.replace(/\/+$/, '')}/api/public/venopag-webhook`;
}

// ============ Warm (no-op para compatibilidade com fluxo anterior) ============
export const warmVenopagPix = createServerFn({ method: 'POST' }).handler(async () => {
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
  tracking: trackingSchema.optional(),
  source: z.enum(['default', 'produto4', 'produto5']).optional(),
});

function sanitizeDigits(value?: string | null): string {
  if (!value) return '';
  return String(value).replace(/\D+/g, '');
}

export const createVenopagPixPayment = createServerFn({ method: 'POST' })
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
      console.error('[venopag-create][BLOQUEIO]', { motivos: blockReasons, origin });
      throw new Error(`Pagamento bloqueado: ${blockReasons.join('; ')}`);
    }

    // Persistir pedido ANTES de chamar Venopag
    const pedidoId = data.externalReference;
    const source: VenopagSource = (data.source === 'produto4' || data.source === 'produto5') ? data.source : 'default';
    const trackingToSave = { ...(data.tracking ?? {}), _venopag_source: source } as any;
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
      console.error('[venopag-create] erro ao persistir pedido', insertErr);
      throw new Error('Não foi possível registrar o pedido. Tente novamente.');
    }

    // Documento: se não veio, usa um CPF placeholder válido em formato (Venopag exige string)
    const document =
      sanitizeDigits((tracking as any).document) ||
      sanitizeDigits(data.payerPhone) ||
      '00000000000';

    const body = {
      amount: Number(data.unitPrice.toFixed(2)),
      name: data.payerName || tracking.name || 'Cliente',
      document,
      description: `${data.title} (${pedidoId})`.slice(0, 140),
      webhook_url: `${getWebhookUrl()}?ref=${encodeURIComponent(pedidoId)}`,
    };

    let upstream: any = null;
    let httpStatus = 0;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${VENOPAG_BASE}/api/cashin`, {
        method: 'POST',
        headers: getVenopagAuthHeaders(source),
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
      if (!res.ok || !upstream?.ok) {
        console.error('[venopag-create][ERROR]', { httpStatus, response: upstream });
        const msg = upstream?.error || upstream?.message || `HTTP ${httpStatus}`;
        throw new Error(`Falha ao gerar Pix (Venopag): ${msg}`);
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

    const requestNumber: string = upstream?.request_number || upstream?.transaction_id || '';
    const copiaECola: string = upstream?.copyPaste || upstream?.code || '';
    const qrImage: string = upstream?.qr_img || '';

    if (!requestNumber || !copiaECola) {
      console.error('[venopag-create][INCOMPLETO]', upstream);
      throw new Error('Venopag retornou cobrança incompleta.');
    }

    let qrBase64 = qrImage.startsWith('data:') ? qrImage.split(',')[1] || '' : qrImage;
    if (!qrBase64 && copiaECola) {
      try {
        const QRCode = (await import('qrcode')).default;
        const dataUrl = await QRCode.toDataURL(copiaECola, { margin: 1, width: 320 });
        qrBase64 = dataUrl.split(',')[1] || '';
      } catch (e) {
        console.error('[venopag-create] erro ao gerar QR base64', e);
      }
    }

    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({
        efi_txid: requestNumber, // reusamos a coluna existente para o gateway atual
        efi_loc_id: upstream?.transaction_id || null,
        efi_qrcode: qrBase64 || null,
        efi_copia_cola: copiaECola,
        efi_expires_at: null,
        efi_status: 'PENDING',
        efi_payload: upstream as any,
      } as any)
      .eq('external_reference', data.externalReference);

    if (updateErr) {
      console.error('[venopag-create] erro ao salvar dados', updateErr);
      throw new Error('Pix gerado, mas não foi possível registrar o vínculo do pedido.');
    }

    console.log('[venopag-create][OK]', {
      pedidoId,
      requestNumber,
      total_ms: Date.now() - totalStartedAt,
    });

    return {
      id: requestNumber,
      txid: requestNumber,
      status: 'pending',
      qr_code: copiaECola,
      qr_code_base64: qrBase64,
      ticket_url: '',
      external_reference: data.externalReference,
      transaction_amount: Number(data.unitPrice.toFixed(2)),
      expires_at: null,
    };
  });

// ============ Polling de status ============
const statusInput = z.object({ txid: z.string().min(4).max(120) });

export const getVenopagPaymentStatus = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => statusInput.parse(input))
  .handler(async ({ data }) => {
    let { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, status, amount, external_reference, efi_status, efi_txid, created_at, tracking_payload')
      .eq('efi_txid', data.txid)
      .maybeSingle();

    if (!order) {
      return { status: 'pending', external_reference: undefined, transaction_amount: 0 };
    }

    const orderSource: VenopagSource =
      ((order as any).tracking_payload?._venopag_source === 'produto4' || (order as any).tracking_payload?._venopag_source === 'produto5') 
        ? (order as any).tracking_payload?._venopag_source 
        : 'default';

    const internal0 = String(order.status || '').toLowerCase();
    const gw0 = String((order as any).efi_status || '').toUpperCase();
    const alreadyPaid =
      internal0 === 'approved' || internal0 === 'paid' || internal0 === 'pago' ||
      gw0 === 'CONFIRMED' || gw0 === 'PAID' || gw0 === 'CONCLUIDA';

    // ===== Fallback de reconciliação =====
    // Se o pedido ainda não está pago, consulta a VenoPag diretamente.
    // Isso cobre o caso do webhook não chegar.
    if (!alreadyPaid) {
      try {
        const consult = await consultVenopagTransaction(data.txid, orderSource);
        if (consult.status === 'confirmed') {
          console.log('[VENOPAG_PAGAMENTO_CONFIRMADO][fallback]', { txid: data.txid });
          // Dispara o webhook interno para reutilizar todo o fluxo (UTMify + Meta CAPI + email)
          try {
            const base = process.env.VENOPAG_WEBHOOK_BASE_URL?.trim() || 'https://eletrojundiai.shop';
            const url = `${base.replace(/\/+$/, '')}/api/public/venopag-webhook`;
            await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'cashin', status: 'confirmed', request_number: data.txid }),
            });
          } catch (err) {
            console.error('[VENOPAG_PAGAMENTO_CONFIRMADO][fallback] erro ao acionar webhook', err);
          }
          // Recarrega
          const refreshed = await supabaseAdmin
            .from('orders')
            .select('id, status, amount, external_reference, efi_status, efi_txid, created_at, tracking_payload')
            .eq('id', order!.id)
            .maybeSingle();
          if (refreshed.data) order = refreshed.data;
        } else if (consult.status === 'expired') {
          await supabaseAdmin
            .from('orders')
            .update({ efi_status: 'EXPIRED' } as any)
            .eq('id', order.id);
        }
      } catch (err) {
        console.error('[venopag-status] erro na reconciliação', err);
      }
    }

    const internal = String(order.status || '').toLowerCase();
    const gw = String((order as any).efi_status || '').toUpperCase();
    const isPaid =
      internal === 'approved' || internal === 'paid' || internal === 'pago' ||
      gw === 'CONFIRMED' || gw === 'PAID' || gw === 'CONCLUIDA';
    const isFailed =
      internal === 'rejected' || internal === 'cancelled' || internal === 'canceled' ||
      gw === 'EXPIRED' || gw === 'CANCELLED';

    return {
      status: isPaid ? 'approved' : isFailed ? 'rejected' : 'pending',
      external_reference: order.external_reference || undefined,
      transaction_amount: Number(order.amount || 0),
    };
  });


// Detecta status aprovado em vários formatos possíveis de resposta da VenoPag.
export function detectVenopagApproved(json: any): boolean {
  if (!json || typeof json !== 'object') return false;
  const APPROVED_VALUES = new Set([
    'confirmed', 'paid', 'approved', 'completed', 'success',
    'concluida', 'concluído', 'concluido', 'aprovado', 'pago',
  ]);
  const checkStatus = (v: any) =>
    typeof v === 'string' && APPROVED_VALUES.has(v.toLowerCase().trim());
  const candidates: any[] = [
    json.status, json.payment_status, json.paymentStatus,
    json?.transaction?.status, json?.data?.status, json?.pix?.status,
    json?.cashin?.status, json?.charge?.status, json?.payment?.status,
    json?.result?.status,
  ];
  if (candidates.some(checkStatus)) return true;
  const truthyFlags = [json.paid, json.approved, json.completed, json.success,
    json?.data?.paid, json?.data?.approved];
  if (truthyFlags.some((v) => v === true || v === 'true' || v === 1)) return true;
  return false;
}

function detectVenopagExpired(json: any): boolean {
  if (!json || typeof json !== 'object') return false;
  const EXPIRED = new Set(['expired', 'cancelled', 'canceled', 'expirado', 'cancelado']);
  const cs = [json.status, json.payment_status, json?.transaction?.status,
    json?.data?.status, json?.pix?.status];
  return cs.some((v) => typeof v === 'string' && EXPIRED.has(v.toLowerCase().trim()));
}

// Reconsulta a Venopag e retorna o status normalizado.
export async function consultVenopagTransaction(
  requestNumber: string,
  source: VenopagSource = 'default',
): Promise<{
  ok: boolean;
  status: 'pending' | 'confirmed' | 'expired' | 'unknown';
  raw: any;
}> {
  const url = `${VENOPAG_BASE}/api/consult-transaction?request_number=${encodeURIComponent(requestNumber)}`;
  const res = await fetch(url, { method: 'GET', headers: getVenopagAuthHeaders(source) });
  const text = await res.text();
  console.log('[VENOPAG_CONSULT_RESPONSE_RAW]', {
    request_number: requestNumber,
    httpStatus: res.status,
    body: text,
  });
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  console.log('[VENOPAG_CONSULT_RESPONSE_JSON]', {
    request_number: requestNumber,
    json,
  });

  let normalized: 'pending' | 'confirmed' | 'expired' | 'unknown' = 'unknown';
  if (detectVenopagApproved(json)) {
    normalized = 'confirmed';
    console.log('[VENOPAG_PAGAMENTO_CONFIRMADO]', { request_number: requestNumber });
  } else if (detectVenopagExpired(json)) {
    normalized = 'expired';
  } else {
    const s = String(json?.status || '').toLowerCase();
    if (s === 'pending' || s === 'pendente' || s === 'waiting') normalized = 'pending';
  }

  return { ok: res.ok, status: normalized, raw: json };
}

