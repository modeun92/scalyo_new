-- COPIL client-centric (étape 2) — lier un copil à un client du portefeuille.
-- client_id nullable : les copils pour des clients hors portefeuille restent
-- possibles via le champ texte client_name. ON DELETE SET NULL : supprimer un
-- client ne détruit pas ses decks. Idempotente.
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
