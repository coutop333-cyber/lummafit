// Captura de UTMs, fbp, fbc, fbclid e referrer em localStorage
// para uso posterior em webhook (Conversion API / UTMify).

const KEY = 'cc_tracking_v1';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'src', 'sck'] as const;

export interface TrackingData {
  utms: Record<string, string>;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  referrer?: string;
  landing_url?: string;
  first_touch_url?: string; // URL completa do primeiro clique (preserva UTMs do anúncio)
  user_agent?: string;
  first_seen_at?: string;
}

const getCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : undefined;
};

const setCookie = (name: string, value: string, days = 90) => {
  if (typeof document === 'undefined') return;
  const exp = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
};

export function captureTracking(): TrackingData {
  if (typeof window === 'undefined') return { utms: {} };

  let stored: TrackingData = { utms: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {}

  const url = new URL(window.location.href);
  const params = url.searchParams;

  // UTMs - sobrescreve se vier nova UTM
  const newUtms: Record<string, string> = { ...stored.utms };
  let hasNewUtm = false;
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) { newUtms[k] = v; hasNewUtm = true; }
  }

  // fbclid → fbc (formato fb.1.<timestamp>.<fbclid>)
  const fbclid = params.get('fbclid') || stored.fbclid;
  let fbc = getCookie('_fbc') || stored.fbc;
  if (fbclid && !fbc) {
    fbc = `fb.1.${Date.now()}.${fbclid}`;
    setCookie('_fbc', fbc);
  }

  // fbp - vem do pixel, lemos do cookie
  const fbp = getCookie('_fbp') || stored.fbp;

  // Preserva a URL do primeiro clique com UTMs (importante para atribuição de campanha)
  const currentUrl = window.location.href;
  const hasUtmsInUrl = [...UTM_KEYS].some((k) => params.get(k));
  const firstTouchUrl = stored.first_touch_url || (hasUtmsInUrl ? currentUrl : undefined);

  const data: TrackingData = {
    utms: newUtms,
    fbp,
    fbc,
    fbclid: fbclid || undefined,
    referrer: stored.referrer || (document.referrer || undefined),
    landing_url: stored.landing_url || currentUrl,
    first_touch_url: firstTouchUrl,
    user_agent: stored.user_agent || navigator.userAgent,
    first_seen_at: stored.first_seen_at || new Date().toISOString(),
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}

  // Mantém disponível em sessionStorage também (alguns scripts esperam aí)
  try {
    if (hasNewUtm) sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {}

  // Log de UTMs recebidas/persistidas (entrada)
  try {
    console.log('[tracking] captureTracking', {
      utms: data.utms,
      fbclid: data.fbclid || null,
      fbp: data.fbp || null,
      fbc: data.fbc || null,
      hasNewUtm,
      landing_url: data.landing_url,
    });
  } catch {}

  return data;
}

export function getTracking(): TrackingData {
  if (typeof window === 'undefined') return { utms: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { utms: {} };
}

// Event ID estável para deduplicação Pixel ↔ Conversion API
export function newEventId(prefix = 'evt'): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rnd}`;
}
