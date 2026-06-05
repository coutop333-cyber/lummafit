ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS utmify_payload JSONB,
  ADD COLUMN IF NOT EXISTS utmify_http_status INTEGER,
  ADD COLUMN IF NOT EXISTS utmify_response TEXT,
  ADD COLUMN IF NOT EXISTS utmify_error TEXT;

CREATE INDEX IF NOT EXISTS orders_utmify_sent_at_idx ON public.orders (utmify_sent_at);
CREATE INDEX IF NOT EXISTS orders_utmify_http_status_idx ON public.orders (utmify_http_status);