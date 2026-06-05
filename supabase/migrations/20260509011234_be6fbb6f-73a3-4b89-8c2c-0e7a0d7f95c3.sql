DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'No direct client access to orders'
  ) THEN
    CREATE POLICY "No direct client access to orders"
      ON public.orders
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;