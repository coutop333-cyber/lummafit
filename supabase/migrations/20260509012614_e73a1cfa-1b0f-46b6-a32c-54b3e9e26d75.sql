ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS meta_capi_payload jsonb,
  ADD COLUMN IF NOT EXISTS meta_capi_http_status integer,
  ADD COLUMN IF NOT EXISTS meta_capi_response text,
  ADD COLUMN IF NOT EXISTS meta_capi_error text;