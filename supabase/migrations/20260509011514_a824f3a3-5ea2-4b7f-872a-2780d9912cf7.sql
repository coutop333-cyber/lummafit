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