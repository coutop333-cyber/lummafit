
CREATE TABLE public.orders (
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
  utmify_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_status_idx ON public.orders (status);
CREATE INDEX orders_mp_payment_id_idx ON public.orders (mp_payment_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Sem policies: ninguém com chave anônima consegue ler/escrever.
-- Apenas o backend (service role) acessa esta tabela.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
