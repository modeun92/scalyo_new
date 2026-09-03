-- SCALYO — Fix chat RLS policies (security hardening)
-- Remplace les policies "USING (true)" par des controles authentification + ownership
-- A executer dans Supabase SQL Editor

-- ─── CHANNELS ────────────────────────────────────────────────────────────────
-- Supprimer la policy ouverte
DROP POLICY IF EXISTS "chat_channels_all" ON public.chat_channels;

-- Lecture : tout utilisateur authentifie
CREATE POLICY "chat_channels_select"
  ON public.chat_channels FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Creation : tout utilisateur authentifie (created_by doit etre soi-meme)
CREATE POLICY "chat_channels_insert"
  ON public.chat_channels FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (created_by IS NULL OR created_by = auth.uid()));

-- Modification : uniquement le createur du channel
CREATE POLICY "chat_channels_update"
  ON public.chat_channels FOR UPDATE
  USING (created_by = auth.uid());

-- Suppression : uniquement le createur du channel
CREATE POLICY "chat_channels_delete"
  ON public.chat_channels FOR DELETE
  USING (created_by = auth.uid());

-- ─── MESSAGES ────────────────────────────────────────────────────────────────
-- Supprimer la policy ouverte
DROP POLICY IF EXISTS "chat_messages_all" ON public.chat_messages;

-- Lecture : tout utilisateur authentifie
CREATE POLICY "chat_messages_select"
  ON public.chat_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Creation : uniquement avec son propre user_id
CREATE POLICY "chat_messages_insert"
  ON public.chat_messages FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Modification : uniquement ses propres messages
CREATE POLICY "chat_messages_update"
  ON public.chat_messages FOR UPDATE
  USING (user_id = auth.uid());

-- Suppression : uniquement ses propres messages
CREATE POLICY "chat_messages_delete"
  ON public.chat_messages FOR DELETE
  USING (user_id = auth.uid());
