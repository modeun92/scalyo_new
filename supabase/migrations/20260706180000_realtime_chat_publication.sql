-- Realtime chat — publier chat_messages dans supabase_realtime.
-- Constat 6/07/2026 : publication vide en préprod => aucun événement
-- postgres_changes ne circulait pour le chat (souscription refusée :
-- « check Realtime is enabled »). Appliqué à la main en préprod le 6/07
-- (sonde JOIN => « Subscribed to PostgreSQL ») ; cette migration formalise.
-- Idempotente : ne fait rien si la table est déjà publiée (cas prod).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;
