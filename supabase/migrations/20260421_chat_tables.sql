-- SCALYO — Chat Tables (persistance + temps réel)
-- Exécuter dans Supabase SQL Editor

-- 1. CHANNELS
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid,
  name text NOT NULL,
  description text DEFAULT '',
  type text NOT NULL DEFAULT 'channel' CHECK (type IN ('channel', 'dm')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_channels_team_idx ON public.chat_channels(team_id);
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_channels_all" ON public.chat_channels;
CREATE POLICY "chat_channels_all" ON public.chat_channels FOR ALL USING (true) WITH CHECK (true);

-- 2. MESSAGES
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT '',
  content text NOT NULL,
  reply_to uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  pinned boolean NOT NULL DEFAULT false,
  reactions jsonb DEFAULT '[]',
  attachments jsonb DEFAULT '[]',
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_channel_idx ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_user_idx ON public.chat_messages(user_id);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_messages_all" ON public.chat_messages;
CREATE POLICY "chat_messages_all" ON public.chat_messages FOR ALL USING (true) WITH CHECK (true);

-- 3. Activer Realtime sur les deux tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- 4. Insérer les channels par défaut (si vides)
INSERT INTO public.chat_channels (id, name, description, type) VALUES
  ('00000000-0000-0000-0000-000000000001', 'general', 'Discussion generale', 'channel'),
  ('00000000-0000-0000-0000-000000000002', 'cs-team', 'Equipe Customer Success', 'channel'),
  ('00000000-0000-0000-0000-000000000003', 'alertes', 'Alertes et notifications', 'channel')
ON CONFLICT (id) DO NOTHING;