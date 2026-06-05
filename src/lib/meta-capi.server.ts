import { createHash } from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const sha256 = (v: string) =>
  createHash('sha256').update(v.trim().toLowerCase()).digest('hex');

export type MetaCapiResult = {
  ok: boolean;
  payload: unknown;
  httpStatus: number | null;
  responseBody: string | null;
  error: string | null;
};

function getSiteUrl(): string {
  // Sempre usa o domínio principal — nunca o webhook URL
  return 'https://copadasfigurinhas.com';
}

function buildUserData(order: any): Record<string, unknown> {
  const tracking = order.tracking_payload || {};
  const userData: Record<string, unknown> = {};

  if (tracking.fbp) userData.fbp = tracking.fbp;
  if (tracking.fbc) userData.fbc = tracking.fbc;
  if (order.client_ip) userData.client_ip_address = order.client_ip;
  if (order.client_user_agent) userData.client_user_agent = order.client_user_agent;
  if (tracking.email) userData.em = [sha256(String(tracking.email))];
  if (tracking.phone) userData.ph = [sha256(String(tracking.phone).replace(/\D/g, ''))];
  // external_id para deduplicação cruzada
  if (order.id) userData.external_id = [sha256(String(order.id))];

  return userData;
}

async function sendCapiEvent(
  eventName: string,
  eventId: string,
  customData: Record<string, unknown>,
  userData: Record<string, unknown>,
  eventSourceUrl: string,
  opts: { logTag?: string } = {},
): Promise<MetaCapiResult> {
  const logTag = opts.logTag || `[meta-capi][${eventName}]`;
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN;
  const testEventCode = process.env.META_TEST_EVENT_CODE || undefined;

  if (!pixelId || !accessToken) {
    const error = `META_PIXEL_ID (${pixelId ? '✓' : '✗'}) ou META_CONVERSIONS_API_TOKEN (${accessToken ? '✓' : '✗'}) ausente`;
    console.error(logTag, error);
    return { ok: false, payload: null, httpStatus: null, responseBody: null, error };
  }

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: 'website',
    event_source_url: eventSourceUrl,
    user_data: userData,
    custom_data: customData,
  };

  const payload: Record<string, unknown> = { data: [event] };
  if (testEventCode) payload.test_event_code = testEventCode;

  const url = `https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${accessToken}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const responseBody = await res.text();
    console.log(`${logTag}`, {
      event_name: eventName,
      event_id: eventId,
      http_status: res.status,
      response: responseBody,
      has_fbp: !!userData.fbp,
      has_fbc: !!userData.fbc,
      has_email: !!userData.em,
    });
    if (!res.ok) {
      return { ok: false, payload, httpStatus: res.status, responseBody, error: `HTTP ${res.status}` };
    }
    return { ok: true, payload, httpStatus: res.status, responseBody, error: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`${logTag} exceção`, error);
    return { ok: false, payload: { data: [event] }, httpStatus: null, responseBody: null, error };
  }
}

// ============ Purchase ============
export async function sendMetaCapiPurchase(
  order: any,
  opts: { eventId?: string; logTag?: string } = {},
): Promise<MetaCapiResult> {
  const tracking = order.tracking_payload || {};
  const userData = buildUserData(order);

  const hasStrongId = Boolean(tracking.fbp || tracking.fbc || tracking.email);
  const hasIpUa = Boolean(order.client_ip && order.client_user_agent);
  if (!hasStrongId && !hasIpUa) {
    const error = 'tracking_payload sem dados mínimos (fbp/fbc/email ou IP+UA)';
    console.warn(`[meta-capi][PURCHASE][bloqueio]`, { error, external_reference: order.external_reference });
    return { ok: false, payload: null, httpStatus: null, responseBody: null, error };
  }

  const siteUrl = getSiteUrl();
  // Usa first_touch_url (URL com UTMs do clique no anúncio) para melhor atribuição
  const eventSourceUrl = tracking.first_touch_url || tracking.landing_url || `${siteUrl}/`;
  const eventId = opts.eventId || order.external_reference;

  const customData = {
    currency: 'BRL',
    value: Number(order.amount),
    content_ids: [`kit-${order.kit_id}`],
    content_name: order.kit_title,
    content_type: 'product',
    num_items: 1,
    order_id: order.external_reference,
  };

  return sendCapiEvent('Purchase', eventId, customData, userData, eventSourceUrl, { logTag: opts.logTag || '[meta-capi][PURCHASE]' });
}

export async function sendAndLogMetaCapiPurchase(
  order: any,
  opts: { eventId?: string; logTag?: string } = {},
): Promise<boolean> {
  const result = await sendMetaCapiPurchase(order, opts);
  await supabaseAdmin
    .from('orders')
    .update({
      meta_capi_payload: result.payload as any,
      meta_capi_http_status: result.httpStatus,
      meta_capi_response: result.responseBody,
      meta_capi_error: result.error,
      meta_capi_sent_at: result.ok ? new Date().toISOString() : null,
    } as any)
    .eq('id', order.id);
  return result.ok;
}
