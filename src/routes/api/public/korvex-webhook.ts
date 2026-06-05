import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { sendUtmifyOrder } from '@/lib/utmify.server';
import { sendAndLogMetaCapiPurchase } from '@/lib/meta-capi.server';

// POST /api/public/korvex-webhook
// Webhook chamado pela Korvex quando o status da cobrança muda.

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-public-key',
  'Cache-Control': 'no-store',
};

const PAID_EVENTS = new Set([
  // Korvex
  'ok', 'transaction_paid',
  // Genéricos
  'paid', 'approved', 'completed', 'confirmed', 'success',
  // Português
  'concluido', 'concluída', 'aprovado', 'pago', 'confirmado',
]);

const bodySchema = z
  .object({
    event: z.string().optional(),
    status: z.string().optional(),
    transactionId: z.string().trim().min(4).max(200).optional(),
    transaction_id: z.string().trim().min(4).max(200).optional(),
    id: z.string().trim().min(4).max(200).optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    metadata: z.object({
      externalReference: z.string().optional(),
      callbackUrl: z.string().optional(),
    }).optional(),
  })
  .passthrough();

export const Route = createFileRoute('/api/public/korvex-webhook')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      GET: async () =>
        new Response(
          JSON.stringify({ ok: true, route: 'korvex-webhook', method: 'POST' }),
          { status: 200, headers: cors },
        ),

      POST: async ({ request }) => {
        const headersObj: Record<string, string> = {};
        request.headers.forEach((v, k) => { headersObj[k] = v; });
        console.log('[KORVEX_WEBHOOK_HEADERS]', headersObj);

        let rawBody = '';
        try {
          rawBody = await request.text();
        } catch (err) {
          console.error('[KORVEX_WEBHOOK] erro ao ler body', err);
          return new Response(JSON.stringify({ error: 'cannot read body' }), { status: 400, headers: cors });
        }
        console.log('[KORVEX_WEBHOOK_BODY_RAW]', rawBody);

        let json: unknown;
        try {
          json = JSON.parse(rawBody);
        } catch {
          console.error('[KORVEX_WEBHOOK] json inválido', rawBody);
          return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: cors });
        }
        console.log('[KORVEX_WEBHOOK_BODY_JSON]', json);

        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          console.warn('[korvex-webhook] payload inválido', parsed.error.flatten());
          return new Response(JSON.stringify({ error: 'invalid payload' }), { status: 400, headers: cors });
        }

        const url = new URL(request.url);
        const refQs = url.searchParams.get('ref') || undefined;

        // Identificar o evento — loga TUDO para diagnóstico
        const rawEvent = String(parsed.data.event || parsed.data.status || '').toLowerCase().trim();
        const rawStatus = String(parsed.data.status || parsed.data.event || '').toLowerCase().trim();
        const isPaid = PAID_EVENTS.has(rawEvent) || PAID_EVENTS.has(rawStatus);

        console.log('[KORVEX_WEBHOOK_EVENTO]', {
          rawEvent,
          rawStatus,
          isPaid,
          fullBody: json,
          refQs,
        });

        // Identificar o transactionId
        const transactionId =
          parsed.data.transactionId ||
          parsed.data.transaction_id ||
          parsed.data.id ||
          '';

        if (!transactionId && !refQs) {
          console.warn('[korvex-webhook] sem transactionId nem ref');
          return new Response(JSON.stringify({ error: 'missing transactionId' }), { status: 400, headers: cors });
        }

        if (!isPaid) {
          console.log('[korvex-webhook] evento não-pago ignorado', { rawEvent, rawStatus, transactionId });
          return new Response(
            JSON.stringify({ success: true, ignored: true, event: rawEvent }),
            { status: 200, headers: cors },
          );
        }

        // Localizar pedido por transactionId (efi_txid) ou external_reference
        let order: any = null;

        if (transactionId) {
          const { data, error } = await supabaseAdmin
            .from('orders')
            .select('id, status, amount, external_reference, efi_status, approved_at, tracking_payload, order_email_sent_at')
            .eq('efi_txid', transactionId)
            .maybeSingle();
          if (!error) order = data;
        }

        // Fallback por external_reference do metadata ou query string
        if (!order) {
          const extRef = parsed.data.metadata?.externalReference || refQs;
          if (extRef) {
            const { data, error } = await supabaseAdmin
              .from('orders')
              .select('id, status, amount, external_reference, efi_status, approved_at, tracking_payload, order_email_sent_at')
              .eq('external_reference', extRef)
              .maybeSingle();
            if (!error) order = data;
          }
        }

        if (!order) {
          console.warn('[korvex-webhook] pedido não encontrado', { transactionId, refQs });
          return new Response(
            JSON.stringify({ error: 'order not found', transactionId }),
            { status: 404, headers: cors },
          );
        }

        console.log('[KORVEX_PEDIDO_ENCONTRADO]', {
          order_id: order.id,
          external_reference: order.external_reference,
          status_atual: order.status,
        });

        const alreadyPaid =
          String(order.status || '').toLowerCase() === 'paid' ||
          String(order.status || '').toLowerCase() === 'approved' ||
          String(order.efi_status || '').toUpperCase() === 'CONFIRMED';

        if (!alreadyPaid) {
          const { error: updErr } = await supabaseAdmin
            .from('orders')
            .update({
              status: 'paid',
              efi_status: 'CONFIRMED',
              efi_txid: transactionId || order.efi_txid,
              approved_at: new Date().toISOString(),
            } as any)
            .eq('id', order.id)
            .neq('status', 'paid');

          if (updErr) {
            console.error('[korvex-webhook] erro ao atualizar pedido', updErr);
            return new Response(JSON.stringify({ error: 'update failed' }), { status: 500, headers: cors });
          }
        }

        console.log('[KORVEX_PEDIDO_PAGO]', {
          transactionId,
          order_id: order.id,
          external_reference: order.external_reference,
        });

        // Carregar pedido completo para integrações
        const { data: fullOrder } = await supabaseAdmin
          .from('orders')
          .select('*')
          .eq('id', order.id)
          .maybeSingle();
        const orderFull = fullOrder || order;


        // ===== UTMify =====
        try {
          const { data: claimed } = await supabaseAdmin
            .rpc('claim_order_utmify' as any, { _order_id: order.id } as any)
            .maybeSingle();

          if (claimed) {
            try {
              await sendUtmifyOrder(orderFull, { status: 'waiting_payment' });
            } catch (err) {
              console.error('[korvex-webhook][UTMify-waiting]', err);
            }

            const result = await sendUtmifyOrder(orderFull, { status: 'paid' });
            console.log('[KORVEX_UTMIFY_RESPONSE]', {
              ok: result.ok,
              httpStatus: result.httpStatus,
              responseBody: result.responseBody,
            });

            await supabaseAdmin
              .from('orders')
              .update({
                utmify_payload: result.payload as any,
                utmify_http_status: result.httpStatus,
                utmify_response: result.responseBody,
                utmify_error: result.error,
                utmify_sent_at: result.ok ? new Date().toISOString() : null,
                utmify_processing_at: null,
              } as any)
              .eq('id', order.id);
          }
        } catch (err) {
          console.error('[korvex-webhook][UTMify]', err);
        }

        // ===== Meta CAPI Purchase =====
        try {
          console.log('[KORVEX_META_CAPI_CHECK]', {
            meta_capi_sent_at: (orderFull as any).meta_capi_sent_at,
            has_pixel_id: !!process.env.META_PIXEL_ID,
            has_token: !!process.env.META_CONVERSIONS_API_TOKEN,
            pixel_id: process.env.META_PIXEL_ID,
          });
          if (!(orderFull as any).meta_capi_sent_at) {
            const metaResult = await sendAndLogMetaCapiPurchase(orderFull, {
              eventId: String(orderFull.external_reference),
              logTag: '[KORVEX_META_CAPI]',
            });
            console.log('[KORVEX_META_CAPI_RESPONSE]', metaResult);
          }
        } catch (err) {
          console.error('[korvex-webhook][Meta CAPI]', err);
        }

        // ===== Email aprovado =====

        return new Response(
          JSON.stringify({
            success: true,
            order_id: order.id,
            external_reference: order.external_reference,
            status: 'paid',
          }),
          { status: 200, headers: cors },
        );
      },
    },
  },
});
