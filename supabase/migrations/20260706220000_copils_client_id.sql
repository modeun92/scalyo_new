-- Client-centric COPIL (step 2) — link a copil to a portfolio client.
-- client_id nullable: copils for clients outside the portfolio stay
-- possible via the client_name text field. ON DELETE SET NULL: deleting a
-- client does not destroy its decks. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'copils' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE public.copils
      ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
    CREATE INDEX idx_copils_client ON public.copils (client_id);
  END IF;
END $$;
