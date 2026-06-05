ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS efi_txid text,
  ADD COLUMN IF NOT EXISTS efi_loc_id text,
  ADD COLUMN IF NOT EXISTS efi_qrcode text,
  ADD COLUMN IF NOT EXISTS efi_copia_cola text,
  ADD COLUMN IF NOT EXISTS efi_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS efi_status text,
  ADD COLUMN IF NOT EXISTS efi_payload jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS orders_efi_txid_key ON public.orders(efi_txid) WHERE efi_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_efi_status_idx ON public.orders(efi_status);