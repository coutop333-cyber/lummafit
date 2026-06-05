-- Log of bulk custom emails sent to customers
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
ON public.bulk_email_log
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_bulk_email_log_email ON public.bulk_email_log(email);
CREATE INDEX IF NOT EXISTS idx_bulk_email_log_campaign ON public.bulk_email_log(campaign_key);
CREATE INDEX IF NOT EXISTS idx_bulk_email_log_created ON public.bulk_email_log(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bulk_email_log_campaign_email
  ON public.bulk_email_log(campaign_key, email)
  WHERE campaign_key IS NOT NULL;