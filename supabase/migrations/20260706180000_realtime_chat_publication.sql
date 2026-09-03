-- Realtime chat — publish chat_messages into supabase_realtime.
-- Observed 6/07/2026: empty publication on pre-prod => no postgres_changes
-- event circulated for the chat (subscription refused:
-- "check Realtime is enabled"). Applied manually on pre-prod on 6/07
-- (JOIN probe => "Subscribed to PostgreSQL"); this migration formalizes it.
-- Idempotent: does nothing if the table is already published (production case).
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
