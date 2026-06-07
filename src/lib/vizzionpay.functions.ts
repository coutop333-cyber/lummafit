import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader, getRequestIP } from '@tanstack/react-start/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { sendUtmifyOrder } from '@/lib/utmify.server';
import { sendAndLogMetaCapiPurchase } from '@/lib/meta-capi.server';
import { sendTrackingEmail } from '@/lib/email/sendTrackingEmail.server';

const VIZZION_BASE = 'https://app.vizzionpay.com.br/api/v1';

function getVizzionHeaders(): Record<string, string> {
  const pub = process.env.VIZZIONPAY_PUBLIC_KEY?.trim();
  const sec = process.env.VIZZIONPAY_SECRET_KEY?.trim();
  if (!pub || !sec) throw new Error('VIZZIONPAY_PUBLIC_KEY / VIZZIONPAY_SECRET_KEY não configurados.');
  return {
    'x-public-key': pub,
    'x-secret-key': sec,
    'Content-Type': 'application/json',
  };
}

function getWebhookUrl(): string {
  // URL FIXA da Edge Function — sem ?ref= para não criar webhook por pedido (limite de 20)
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || 'https://lrkmfhqetfwtdrfuginx.supabase.co';
  return `${supabaseUrl}/functions/v1/pix-webhook`;
}

// ============ Warm ============
export const warmVizzionPix = createServerFn({ method: 'POST' }).handler(async () => {
  return { ok: true };
});

// ============ Schemas ============
const trackingSchema = z.object({
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
}).partial();

const createInput = z.object({
  kitId: z.number().int().min(1).max(99),
  title: z.string().trim().min(3).max(255),
  unitPrice: z.number().positive().min(1).max(10000),
  externalReference: z.string().trim().min(8).max(120)
    .refine((v) => !/^(null|undefined|nan)$/i.test(v), 'externalReference inválido'),
  payerEmail: z.string().email().max(120).optional(),
  payerName: z.string().max(160).optional(),
  payerPhone: z.string().max(40).optional(),
  payerDocument: z.string().max(20).optional(),
  tracking: trackingSchema.optional(),
  source: z.enum(['default', 'produto4', 'produto5']).optional(),
});

// ============ Criar cobrança Pix ============
export const createVizzionPixPayment = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => createInput.parse(input))
  .handler(async ({ data }) => {
    const totalStartedAt = Date.now();
    const forwardedIp = getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim();
    const clientIp =
      getRequestIP({ xForwardedFor: true }) ||
      getRequestHeader('cf-connecting-ip') ||
      getRequestHeader('x-real-ip') ||
      forwardedIp || null;
    const userAgent = getRequestHeader('user-agent') || data.tracking?.user_agent || null;
    const origin = getRequestHeader('origin') || getRequestHeader('referer') || null;

    const tracking = data.tracking ?? {};
    const trackingVazio =
      !tracking || Object.keys(tracking).length === 0 ||
      ((!tracking.utms || Object.keys(tracking.utms || {}).length === 0) &&
        !tracking.fbp && !tracking.fbc && !tracking.fbclid &&
        !tracking.email && !tracking.referrer && !tracking.landing_url);

    const emailFake =
      typeof data.payerEmail === 'string' &&
      /cliente\+null@|cliente\+undefined@/i.test(data.payerEmail);

    const blockReasons: string[] = [];
    if (data.unitPrice < 1) blockReasons.push('amount < R$1,00');
    if (emailFake) blockReasons.push('email fake');
    if (!data.title || data.title.trim().length < 3) blockReasons.push('produto vazio');
    if (!data.externalReference || data.externalReference.trim().length < 8) blockReasons.push('external_reference vazio');
    if (trackingVazio) blockReasons.push('tracking_payload vazio');
    if (!userAgent || /^(curl|wget|node|python|axios|go-http|healthcheck|bot)/i.test(userAgent)) {
      blockReasons.push(`user_agent inválido: ${userAgent || 'null'}`);
    }

    if (blockReasons.length) {
      console.error('[vizzion-create][BLOQUEIO]', { motivos: blockReasons, origin });
      throw new Error(`Pagamento bloqueado: ${blockReasons.join('; ')}`);
    }

    const pedidoId = data.externalReference;

    // Embute tokens do site no tracking para o webhook saber qual conta usar
    const trackingToSave = {
      ...(data.tracking ?? {}),
      _source: data.source || 'lummafit',
      _platform: 'LummaFit',
      _site: 'lummafit',
      _site_name: 'Lumma FIT',
      _site_url: 'https://lummafit.com',
      _utmify_token: process.env.UTMIFY_API_TOKEN || '',
      _meta_pixel_id: process.env.META_PIXEL_ID || '',
      _meta_token: process.env.META_CONVERSIONS_API_TOKEN || '',
      _resend_key: process.env.RESEND_API_KEY || '',
      _from_email: process.env.RESEND_FROM_EMAIL || 'Lumma FIT <noreply@suporte.lummafit.com>',
    } as any;

    const { error: insertErr } = await supabaseAdmin
      .from('orders')
      .upsert({
        external_reference: pedidoId,
        kit_id: data.kitId,
        kit_title: data.title,
        amount: Number(data.unitPrice.toFixed(2)),
        status: 'pending',
        tracking_payload: trackingToSave,
        client_ip: clientIp,
        client_user_agent: userAgent,
      } as any, { onConflict: 'external_reference' });

    if (insertErr) {
      console.error('[vizzion-create] erro ao persistir pedido', insertErr);
      throw new Error('Não foi possível registrar o pedido. Tente novamente.');
    }

    const webhookUrl = getWebhookUrl();
    const cpfDigits = (data.payerDocument || '').replace(/\D/g, '');
    const cpfFormatted = cpfDigits.length === 11
      ? cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      : data.payerDocument || '';
    const identifier = pedidoId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);

    const body = {
      identifier,
      amount: Number(data.unitPrice.toFixed(2)),
      client: {
        name: (data.payerName || (tracking as any).name || 'Cliente').slice(0, 100),
        email: data.payerEmail || (tracking as any).email || undefined,
        phone: data.payerPhone || (tracking as any).phone || undefined,
        document: cpfFormatted || undefined,
      },
      products: [{
        id: '1',
        name: 'Infoproduto Digital',
        quantity: 1,
        price: Number(data.unitPrice.toFixed(2)),
      }],
      callbackUrl: webhookUrl,
      metadata: { externalReference: pedidoId },
    };

    let upstream: any = null;
    let httpStatus = 0;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`${VIZZION_BASE}/gateway/pix/receive`, {
        method: 'POST',
        headers: getVizzionHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      httpStatus = res.status;
      const text = await res.text();
      try { upstream = JSON.parse(text); } catch { upstream = { raw: text }; }

      if (!res.ok) {
        console.error('[vizzion-create][ERROR]', { httpStatus, response: upstream });
        const details = upstream?.details
          ? (Array.isArray(upstream.details)
            ? upstream.details.map((d: any) => d?.message || JSON.stringify(d)).join(', ')
            : JSON.stringify(upstream.details))
          : null;
        const msg = upstream?.message || upstream?.error || `HTTP ${httpStatus}`;
        throw new Error(`Falha ao gerar Pix (VizzionPay): ${msg}${details ? ` — ${details}` : ''}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if ((err as any)?.name === 'AbortError' || /aborted|abort/i.test(msg)) {
        throw new Error('A geração do Pix demorou mais que o esperado. Tente novamente.');
      }
      throw new Error(msg.startsWith('Falha') ? msg : `Falha ao gerar Pix: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }

    const transactionId: string = upstream?.transactionId || '';
    const orderId: string = upstream?.order?.id || '';
    const pixCode: string = upstream?.pix?.code || '';
    const rawBase64: string = upstream?.pix?.base64 || upstream?.pix?.image || '';
    let pixBase64: string = rawBase64.startsWith('data:') ? rawBase64.split(',')[1] || '' : rawBase64;

    if (!transactionId || !pixCode) {
      console.error('[vizzion-create][INCOMPLETO]', upstream);
      throw new Error('VizzionPay retornou cobrança incompleta.');
    }

    if (!pixBase64 && pixCode) {
      try {
        const QRCode = (await import('qrcode')).default;
        const dataUrl = await QRCode.toDataURL(pixCode, { margin: 1, width: 320 });
        pixBase64 = dataUrl.split(',')[1] || '';
      } catch (e) {
        console.error('[vizzion-create] erro ao gerar QR base64', e);
      }
    }

    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({
        efi_txid: transactionId,
        efi_loc_id: orderId,
        efi_qrcode: pixBase64 || null,
        efi_copia_cola: pixCode,
        efi_expires_at: null,
        efi_status: 'PENDING',
        efi_payload: upstream as any,
        payment_provider: 'vizzionpay',
      } as any)
      .eq('external_reference', pedidoId);

    if (updateErr) {
      console.error('[vizzion-create] erro ao salvar dados', updateErr);
      throw new Error('Pix gerado, mas não foi possível registrar o vínculo do pedido.');
    }

    console.log('[vizzion-create][OK]', { pedidoId, transactionId, total_ms: Date.now() - totalStartedAt });

    // UTMify: waiting_payment
    try {
      const { data: orderFull } = await supabaseAdmin.from('orders').select('*').eq('external_reference', pedidoId).maybeSingle();
      if (orderFull) {
        const result = await sendUtmifyOrder(orderFull, { status: 'waiting_payment' });
        console.log('[vizzion-create][UTMify-waiting]', { ok: result.ok, httpStatus: result.httpStatus });
      }
    } catch (err) {
      console.error('[vizzion-create][UTMify-waiting] erro', err);
    }

    return {
      id: transactionId,
      txid: transactionId,
      status: 'pending',
      qr_code: pixCode,
      qr_code_base64: pixBase64,
      ticket_url: upstream?.order?.url || '',
      external_reference: pedidoId,
      transaction_amount: Number(data.unitPrice.toFixed(2)),
      expires_at: null,
    };
  });

// ============ Polling de status ============
const statusInput = z.object({ txid: z.string().min(4).max(120) });

export const getVizzionPaymentStatus = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => statusInput.parse(input))
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, status, amount, external_reference, efi_status, efi_txid, created_at, tracking_payload')
      .eq('efi_txid', data.txid)
      .maybeSingle();

    if (!order) return { status: 'pending', external_reference: undefined, transaction_amount: 0 };

    const internal = String(order.status || '').toLowerCase();
    const gw = String((order as any).efi_status || '').toUpperCase();

    const isPaid =
      internal === 'approved' || internal === 'paid' || internal === 'pago' ||
      gw === 'CONFIRMED' || gw === 'PAID' || gw === 'APPROVED' || gw === 'OK';
    const isFailed =
      internal === 'rejected' || internal === 'cancelled' || internal === 'canceled' ||
      gw === 'EXPIRED' || gw === 'CANCELLED';

    // Fallback: consulta VizzionPay diretamente
    if (!isPaid && !isFailed) {
      try {
        const vizzionStatus = await consultVizzionTransaction(data.txid);
        console.log('[vizzion-status][fallback]', { txid: data.txid, status: vizzionStatus.status });

        if (vizzionStatus.status === 'confirmed') {
          await supabaseAdmin.from('orders')
            .update({ status: 'paid', efi_status: 'CONFIRMED', approved_at: new Date().toISOString() } as any)
            .eq('id', order.id);

          try {
            const { data: fullOrder } = await supabaseAdmin.from('orders').select('*').eq('id', order.id).maybeSingle();
            const orderFull = fullOrder || order;

            // Rastreio
            try {
              if (order.external_reference) {
                await supabaseAdmin.from('rastreios' as any).upsert(
                  { codigo_pedido: order.external_reference, status: 'Pagamento aprovado', observacao: '' } as any,
                  { onConflict: 'codigo_pedido', ignoreDuplicates: true }
                );
              }
            } catch (e) { console.error('[vizzion-status][rastreio]', e); }

            // UTMify
            try {
              const { data: claimed } = await supabaseAdmin.rpc('claim_order_utmify' as any, { _order_id: order.id } as any).maybeSingle();
              if (claimed) {
                try { await sendUtmifyOrder(orderFull, { status: 'waiting_payment' }); } catch {}
                const result = await sendUtmifyOrder(orderFull, { status: 'paid' });
                console.log('[vizzion-status][UTMify]', { ok: result.ok, httpStatus: result.httpStatus });
                await supabaseAdmin.from('orders').update({
                  utmify_payload: result.payload as any, utmify_http_status: result.httpStatus,
                  utmify_response: result.responseBody, utmify_error: result.error,
                  utmify_sent_at: result.ok ? new Date().toISOString() : null, utmify_processing_at: null,
                } as any).eq('id', order.id);
              }
            } catch (e) { console.error('[vizzion-status][UTMify]', e); }

            // Meta CAPI
            try {
              if (!(orderFull as any).meta_capi_sent_at) {
                await sendAndLogMetaCapiPurchase(orderFull, { eventId: String(orderFull.external_reference), logTag: '[VIZZION_META_CAPI]' });
              }
            } catch (e) { console.error('[vizzion-status][Meta CAPI]', e); }

            // Email automático de confirmação
            try {
              await sendOrderConfirmationEmail(orderFull);
            } catch (e) { console.error('[vizzion-status][email]', e); }

          } catch (e) { console.error('[vizzion-status][integrações]', e); }

          return { status: 'approved', external_reference: order.external_reference || undefined, transaction_amount: Number(order.amount || 0) };
        }

        if (vizzionStatus.status === 'expired') {
          await supabaseAdmin.from('orders').update({ efi_status: 'EXPIRED' } as any).eq('id', order.id);
          return { status: 'rejected', external_reference: order.external_reference || undefined, transaction_amount: 0 };
        }
      } catch (err) {
        console.error('[vizzion-status][fallback] erro', err);
      }
    }

    // Se pago mas UTMify não enviado ainda
    if (isPaid) {
      try {
        const { data: claimed } = await supabaseAdmin.rpc('claim_order_utmify' as any, { _order_id: order.id } as any).maybeSingle();
        if (claimed) {
          const { data: fullOrder } = await supabaseAdmin.from('orders').select('*').eq('id', order.id).maybeSingle();
          const orderFull = fullOrder || order;
          try { await sendUtmifyOrder(orderFull, { status: 'waiting_payment' }); } catch {}
          const result = await sendUtmifyOrder(orderFull, { status: 'paid' });
          await supabaseAdmin.from('orders').update({
            utmify_payload: result.payload as any, utmify_http_status: result.httpStatus,
            utmify_response: result.responseBody, utmify_error: result.error,
            utmify_sent_at: result.ok ? new Date().toISOString() : null, utmify_processing_at: null,
          } as any).eq('id', order.id);
          if (!(orderFull as any).meta_capi_sent_at) {
            await sendAndLogMetaCapiPurchase(orderFull, { eventId: String(orderFull.external_reference), logTag: '[VIZZION_META_CAPI_FALLBACK]' }).catch(() => {});
          }
          await sendOrderConfirmationEmail(orderFull).catch(() => {});
        }
      } catch (e) { console.error('[vizzion-status][UTMify-paid-fallback]', e); }
    }

    return {
      status: isPaid ? 'approved' : isFailed ? 'rejected' : 'pending',
      external_reference: order.external_reference || undefined,
      transaction_amount: Number(order.amount || 0),
    };
  });

// ============ Email automático de confirmação de pedido ============
async function sendOrderConfirmationEmail(order: any) {
  const tp = order?.tracking_payload || {};
  const customerEmail: string | undefined = tp.email;
  if (!customerEmail) return;
  if ((order as any).order_email_sent_at) return;

  // Claim para não enviar duplicado
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('orders')
    .update({ order_email_sent_at: new Date().toISOString() } as any)
    .eq('id', order.id)
    .is('order_email_sent_at', null)
    .select('id')
    .maybeSingle();

  if (claimErr || !claimed) return;

  const nome = tp.name || tp.nome || 'Cliente';
  const codigo = order.external_reference;
  const kit = order.kit_title || 'Produto';
  const valor = `R$ ${Number(order.amount || 0).toFixed(2).replace('.', ',')}`;
  const link = `https://lummafit.com/rastreio/${codigo}`;

  // Usa a chave do tracking_payload (embarcada no momento da criação do pedido)
  // com fallback para a env var do Vercel
  const resendKey = tp._resend_key || process.env.RESEND_API_KEY || '';
  const fromEmail = tp._from_email || process.env.RESEND_FROM_EMAIL || 'Lumma FIT <noreply@suporte.lummafit.com>';

  if (!resendKey) {
    console.error('[vizzion][email-confirmacao] RESEND_API_KEY ausente');
    await supabaseAdmin.from('orders').update({ order_email_sent_at: null } as any).eq('id', order.id);
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:26px;font-weight:800;">LUMMA FIT</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:15px;">✅ Pagamento confirmado!</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 8px;color:#333;font-size:16px;">Olá, <strong>${nome}</strong>! 🎉</p>
          <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">Seu pagamento foi aprovado e seu pedido já está sendo preparado!</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border:1px solid #e0e4ff;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Produto</p>
              <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1a1a2e;">${kit}</p>
              <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Valor pago</p>
              <p style="margin:0;font-size:20px;font-weight:800;color:#22c55e;">${valor}</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr><td align="center">
              <a href="${link}" style="display:inline-block;background:#1a1a2e;color:#fff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:8px;text-decoration:none;">📦 Acompanhar meu pedido</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:#999;text-align:center;">Código do pedido: ${codigo}</p>
        </td></tr>
        <tr><td style="background:#f8f8f8;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:#aaa;">Lumma FIT · Qualquer dúvida, responda este e-mail.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [customerEmail],
        subject: '✅ Pedido confirmado — Lumma FIT',
        html,
      }),
    });
    const body = await res.json();
    console.log('[vizzion][email-confirmacao]', res.status, body?.id, customerEmail);

    if (!res.ok) {
      console.error('[vizzion][email-confirmacao] erro Resend', body);
      await supabaseAdmin.from('orders').update({ order_email_sent_at: null } as any).eq('id', order.id);
    }
  } catch (err) {
    console.error('[vizzion][email-confirmacao] exceção', err);
    await supabaseAdmin.from('orders').update({ order_email_sent_at: null } as any).eq('id', order.id);
  }
}

// ============ Consulta direta na VizzionPay ============
export async function consultVizzionTransaction(transactionId: string): Promise<{
  status: 'pending' | 'confirmed' | 'expired' | 'unknown';
  raw: any;
}> {
  const pub = process.env.VIZZIONPAY_PUBLIC_KEY?.trim();
  const sec = process.env.VIZZIONPAY_SECRET_KEY?.trim();
  if (!pub || !sec) return { status: 'unknown', raw: null };

  try {
    const res = await fetch(`${VIZZION_BASE}/gateway/transactions?id=${encodeURIComponent(transactionId)}`, {
      method: 'GET',
      headers: { 'x-public-key': pub, 'x-secret-key': sec, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    const statusRaw = String(
      json?.status || json?.transaction?.status || json?.data?.status ||
      json?.payment?.status || json?.pix?.status || ''
    ).toLowerCase();

    const CONFIRMED = new Set(['ok', 'paid', 'approved', 'confirmed', 'completed', 'pago', 'concluido', 'success']);
    const EXPIRED = new Set(['expired', 'cancelled', 'canceled', 'failed', 'rejected']);

    if (CONFIRMED.has(statusRaw)) return { status: 'confirmed', raw: json };
    if (EXPIRED.has(statusRaw)) return { status: 'expired', raw: json };
    return { status: 'pending', raw: json };
  } catch (err) {
    console.error('[vizzion-consult] erro', err);
    return { status: 'unknown', raw: null };
  }
}
