ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS utmify_processing_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS orders_utmify_processing_at_idx ON public.orders (utmify_processing_at);