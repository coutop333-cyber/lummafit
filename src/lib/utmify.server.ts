const UTMIFY_ENDPOINT = 'https://api.utmify.com.br/api-credentials/orders';

type TrackingPayload = {
  name?: string;
  email?: string;
  phone?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  ip?: string;
  client_ip?: string;
  utms?: Record<string, string | undefined>;
};

export type UtmifySendResult = {
  ok: boolean;
  httpStatus: number | null;
  responseBody: string;
  error: string | null;
  payload: Record<string, unknown>;
};

const cleanDigits = (value: unknown) => String(value || '').replace(/\D/g, '');

const utmifyDate = (value?: string | null) => {
  const date = value ? new Date(value) : new Date();
  return date.toISOString().replace('T', ' ').slice(0, 19);
};

const nonEmpty = (value: unknown, fallback: string) => {
  const text = String(value || '').trim();
  return text || fallback;
};

const INVALID_PLACEHOLDERS = new Set(['null', 'undefined', 'nan', 'none', '(none)', '(not set)', '{{utm_source}}', '{{utm_campaign}}', '{{utm_medium}}', '{{utm_content}}', '{{utm_term}}', '{{ad_id}}', '{{adset_id}}', '{{campaign_id}}']);

const cleanRaw = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  let text = String(value).trim();
  if (!text) return null;
  // remove control chars and zero-width
  text = text.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '').trim();
  if (!text) return null;
  if (INVALID_PLACEHOLDERS.has(text.toLowerCase())) return null;
  // detect unresolved template placeholders like {{xxx}} or {xxx}
  if (/^\{+.*\}+$/.test(text)) return null;
  return text;
};

const cleanUtm = (value: unknown): string | null => {
  const cleaned = cleanRaw(value);
  if (!cleaned) return null;
  // strip trailing/leading punctuation noise
  return cleaned.replace(/^[\s,;|]+|[\s,;|]+$/g, '') || null;
};

export function buildUtmifyPayload(
  order: any,
  options?: { isTest?: boolean; status?: 'waiting_payment' | 'paid' },
) {
  const tracking = (order.tracking_payload || {}) as TrackingPayload;
  const utms = tracking.utms || {};
  const amountCents = Math.max(1, Math.round(Number(order.amount || 0) * 100));
  const createdAt = utmifyDate(order.created_at);
  const status = options?.status ?? 'paid';
  const approvedDate = status === 'paid' ? utmifyDate(order.approved_at) : null;

  const platform = process.env.UTMIFY_PLATFORM || 'CopaFigurinhas';

  return {
    orderId: nonEmpty(order.external_reference, `order-${Date.now()}`),
    platform,
    paymentMethod: 'pix',
    status,
    createdAt,
    approvedDate,
    refundedAt: null,
    customer: {
      name: nonEmpty(tracking.name, 'Cliente'),
      email: nonEmpty(tracking.email, `cliente+${order.external_reference}@copadasfigurinhas.com`).toLowerCase(),
      phone: cleanDigits(tracking.phone) || null,
      document: null,
      country: 'BR',
      ip: nonEmpty(order.client_ip || tracking.ip || tracking.client_ip, '0.0.0.0'),
    },
    products: [
      {
        id: `kit-${nonEmpty(order.kit_id, 'produto')}`,
        name: nonEmpty(order.kit_title, 'Body Splash My Sweet Delight'),
        planId: null,
        planName: null,
        quantity: 1,
        priceInCents: amountCents,
      },
    ],
    trackingParameters: {
      src: cleanUtm(utms.src),
      sck: cleanUtm(utms.sck),
      utm_source: cleanUtm(utms.utm_source),
      utm_campaign: cleanUtm(utms.utm_campaign),
      utm_medium: cleanUtm(utms.utm_medium),
      utm_content: cleanUtm(utms.utm_content),
      utm_term: cleanUtm(utms.utm_term),
      fbclid: cleanRaw(tracking.fbclid),
      fbp: cleanRaw(tracking.fbp),
      fbc: cleanRaw(tracking.fbc),
    },
    commission: {
      totalPriceInCents: amountCents,
      gatewayFeeInCents: 0,
      userCommissionInCents: amountCents,
      currency: 'BRL',
    },
    isTest: options?.isTest ?? false,
  };
}

export function buildUtmifyTestPayload() {
  return buildUtmifyPayload(
    {
      external_reference: `TESTE_UTMIFY_${Date.now()}`,
      amount: 1,
      kit_id: 'teste',
      kit_title: 'Venda fake UTMify - Pix',
      created_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
      client_ip: '127.0.0.1',
      tracking_payload: {
        name: 'Cliente Teste',
        email: 'teste@teste.com',
        phone: null,
        fbclid: null,
        fbp: null,
        fbc: null,
        utms: {
          utm_campaign: 'TESTE_UTMIFY',
        },
      },
    },
    { isTest: true },
  );
}

export async function sendUtmifyPayload(
  payload: Record<string, unknown>,
  options?: { apiToken?: string | null },
): Promise<UtmifySendResult> {
  const apiToken = options?.apiToken || process.env.UTMIFY_API_TOKEN;
  if (!apiToken) {
    return {
      ok: false,
      httpStatus: null,
      responseBody: '',
      error: 'UTMIFY_API_TOKEN ausente',
      payload,
    };
  }

  try {
    // ===== LOGS TEMPORÁRIOS DE DEBUG UTMIFY =====
    try {
      const utmifyEnvVars = Object.keys(process.env)
        .filter((k) => k.toUpperCase().startsWith('UTMIFY'))
        .reduce<Record<string, { length: number; suffix: string }>>((acc, k) => {
          const v = String(process.env[k] || '');
          acc[k] = { length: v.length, suffix: v.slice(-6) };
          return acc;
        }, {});

      // Hash simples (djb2) — só pra confirmar que o deploy novo tem o token novo
      let hash = 5381;
      for (let i = 0; i < apiToken.length; i++) {
        hash = ((hash << 5) + hash + apiToken.charCodeAt(i)) | 0;
      }
      const tokenHash = (hash >>> 0).toString(16);

      console.log('[UTMIFY_DEBUG_PRE_FETCH]', {
        secretSourceVar: 'UTMIFY_API_TOKEN',
        tokenSuffix: apiToken.slice(-6),
        tokenLength: apiToken.length,
        tokenHash,
        environment: process.env.NODE_ENV,
        deployUrl:
          process.env.VERCEL_URL ||
          process.env.URL ||
          process.env.CF_PAGES_URL ||
          process.env.WORKERS_CI_BUILD_URL ||
          null,
        utmifyEnvVars,
        endpoint: UTMIFY_ENDPOINT,
        payload,
      });
    } catch (e) {
      console.warn('[UTMIFY_DEBUG_PRE_FETCH] erro ao logar', e);
    }

    const res = await fetch(UTMIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': apiToken,
      },
      body: JSON.stringify(payload),
    });
    const responseBody = await res.text();
    console.log('[UTMIFY_DEBUG_POST_FETCH]', {
      tokenSuffix: apiToken.slice(-6),
      httpStatus: res.status,
      ok: res.ok,
      responseBody,
    });
    return {
      ok: res.ok,
      httpStatus: res.status,
      responseBody,
      error: res.ok ? null : `UTMify HTTP ${res.status}: ${responseBody}`,
      payload,
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: null,
      responseBody: '',
      error: err instanceof Error ? err.message : String(err),
      payload,
    };
  }
}

export async function sendUtmifyOrder(
  order: any,
  options?: { status?: 'waiting_payment' | 'paid' },
) {

  const source = order?.tracking_payload?._source;
  const payload = buildUtmifyPayload(order, options);
  const apiToken = process.env.UTMIFY_API_TOKEN;
  try {
    console.log('[utmify][trackingParameters-enviados]', {
      orderId: (payload as any).orderId,
      trackingParameters: (payload as any).trackingParameters,
    });
  } catch {}
  const result = await sendUtmifyPayload(payload, { apiToken });
  try {
    if (!result.ok) {
      console.error('[utmify][resposta-invalida]', {
        orderId: (payload as any).orderId,
        httpStatus: result.httpStatus,
        error: result.error,
        responseBody: result.responseBody,
        trackingParameters: (payload as any).trackingParameters,
      });
    } else {
      console.log('[utmify][ok]', {
        orderId: (payload as any).orderId,
        httpStatus: result.httpStatus,
        responseBody: result.responseBody?.slice(0, 500),
      });
    }
  } catch {}
  return result;
}
