import { createServerFn } from '@tanstack/react-start';
import { getRequestHost } from '@tanstack/react-start/server';
import { z } from 'zod';
import { buildUtmifyPayload, buildUtmifyTestPayload, sendUtmifyPayload } from './utmify.server';

export const sendUtmifyTestPurchase = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({ confirm: z.literal('TESTE_UTMIFY') }).parse(input),
  )
  .handler(async () => {
    const host = getRequestHost();
    if (host === 'eletrojundiai.shop') {
      throw new Error('Teste UTMify disponível apenas no ambiente interno.');
    }

    const result = await sendUtmifyPayload(buildUtmifyTestPayload());
    console.log('[utmify-test]', {
      ok: result.ok,
      httpStatus: result.httpStatus,
      response: result.responseBody,
      error: result.error,
      payload: result.payload,
    });

    return {
      ok: result.ok,
      httpStatus: result.httpStatus,
      response: result.responseBody,
      error: result.error,
    };
  });

/**
 * Envia uma venda REAL (isTest: false) para a UTMify, com marcadores claros
 * no orderId/utm_campaign para identificar em qual dashboard caiu.
 */
export const sendUtmifyRealPurchaseProbe = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z
      .object({
        confirm: z.literal('SONDA_UTMIFY_REAL'),
        amount: z.number().min(1).max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    const marker = `SONDA_REAL_${Date.now()}`;
    const amount = data.amount ?? 1;

    const fakeOrder = {
      external_reference: marker,
      amount,
      kit_id: 'sonda',
      kit_title: `[SONDA] Venda real UTMify ${marker}`,
      created_at: now,
      approved_at: now,
      client_ip: '127.0.0.1',
      tracking_payload: {
        _venopag_source: 'produto4',
        name: 'Sonda UTMify',
        email: `sonda+${marker.toLowerCase()}@eletrojundiai.shop`,
        phone: '11999999999',
        fbclid: null,
        fbp: null,
        fbc: null,
        utms: {
          utm_source: 'sonda-utmify',
          utm_medium: 'probe',
          utm_campaign: marker,
          utm_content: 'identificar-dashboard',
          utm_term: 'venda-real',
        },
      },
    };

    const payload = buildUtmifyPayload(fakeOrder, { isTest: false, status: 'paid' });
    const result = await sendUtmifyPayload(payload);

    const tokenSuffix = (process.env.UTMIFY_API_TOKEN || '').slice(-6);
    console.log('[utmify-real-probe]', {
      marker,
      tokenSuffix,
      ok: result.ok,
      httpStatus: result.httpStatus,
      response: result.responseBody,
      error: result.error,
    });

    return {
      ok: result.ok,
      marker,
      orderId: marker,
      tokenSuffix,
      httpStatus: result.httpStatus,
      response: result.responseBody,
      error: result.error,
    };
  });
