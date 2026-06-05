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
  ON public.rastreios
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.touch_rastreios_ultima_atualizacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.ultima_atualizacao = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rastreios_touch ON public.rastreios;
CREATE TRIGGER rastreios_touch
  BEFORE UPDATE ON public.rastreios
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_rastreios_ultima_atualizacao();
