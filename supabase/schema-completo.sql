-- ============================================================
-- SCHEMA COMPLETO — rode isso no SQL Editor do Supabase
-- ============================================================

-- Função updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- TABELA: orders
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_reference TEXT NOT NULL UNIQUE,
  mp_payment_id BIGINT UNIQUE,
  kit_id INTEGER NOT NULL,
  kit_title TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  status_detail TEXT,
  approved_at TIMESTAMPTZ,
  tracking_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_ip TEXT,
  client_user_agent TEXT,
  meta_capi_sent_at TIMESTAMPTZ,
  meta_capi_payload JSONB,
  meta_capi_http_status INTEGER,
  meta_capi_response TEXT,
  meta_capi_error TEXT,
  utmify_sent_at TIMESTAMPTZ,
  utmify_processing_at TIMESTAMPTZ,
  utmify_payload JSONB,
  utmify_http_status INTEGER,
  utmify_response TEXT,
  utmify_error TEXT,
  efi_txid TEXT,
  efi_loc_id TEXT,
  efi_qrcode TEXT,
  efi_copia_cola TEXT,
  efi_expires_at TIMESTAMPTZ,
  efi_status TEXT,
  efi_payload JSONB,
  order_email_sent_at TIMESTAMPTZ,
  tracking_email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_mp_payment_id_idx ON public.orders (mp_payment_id);
CREATE INDEX IF NOT EXISTS orders_utmify_sent_at_idx ON public.orders (utmify_sent_at);
CREATE INDEX IF NOT EXISTS orders_utmify_http_status_idx ON public.orders (utmify_http_status);
CREATE INDEX IF NOT EXISTS orders_utmify_processing_at_idx ON public.orders (utmify_processing_at);
CREATE UNIQUE INDEX IF NOT EXISTS orders_efi_txid_key ON public.orders(efi_txid) WHERE efi_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_efi_status_idx ON public.orders(efi_status);
CREATE INDEX IF NOT EXISTS idx_orders_pending_tracking_email ON public.orders (approved_at) WHERE status = 'paid' AND tracking_email_sent_at IS NULL;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to orders"
  ON public.orders FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- FUNÇÃO: claim_order_utmify
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_order_utmify(_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed public.orders;
BEGIN
  UPDATE public.orders
  SET utmify_processing_at = now(),
      utmify_error = null
  WHERE id = _order_id
    AND utmify_sent_at IS NULL
    AND (
      utmify_processing_at IS NULL
      OR utmify_processing_at < now() - interval '5 minutes'
    )
  RETURNING * INTO claimed;
  RETURN claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_order_utmify(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_order_utmify(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_order_utmify(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_utmify(uuid) TO service_role;

-- ============================================================
-- TABELA: rastreios
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rastreios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_pedido text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'Pagamento aprovado',
  observacao text,
  ultima_atualizacao timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rastreios_codigo ON public.rastreios (codigo_pedido);

ALTER TABLE public.rastreios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to rastreios"
  ON public.rastreios FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.touch_rastreios_ultima_atualizacao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.ultima_atualizacao = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreios_touch ON public.rastreios;
CREATE TRIGGER rastreios_touch
  BEFORE UPDATE ON public.rastreios
  FOR EACH ROW EXECUTE FUNCTION public.touch_rastreios_ultima_atualizacao();

-- ============================================================
-- TABELA: bulk_email_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bulk_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  external_reference text,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  campaign_key text,
  resend_id text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to bulk_email_log"
  ON public.bulk_email_log FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_bulk_email_log_email ON public.bulk_email_log(email);
CREATE INDEX IF NOT EXISTS idx_bulk_email_log_campaign ON public.bulk_email_log(campaign_key);
CREATE INDEX IF NOT EXISTS idx_bulk_email_log_created ON public.bulk_email_log(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bulk_email_log_campaign_email
  ON public.bulk_email_log(campaign_key, email)
  WHERE campaign_key IS NOT NULL;
