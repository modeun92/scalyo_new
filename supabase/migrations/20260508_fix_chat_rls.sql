-- SCALYO — Fix chat RLS policies (security hardening)
-- Replaces the "USING (true)" policies with authentication + ownership checks
-- To be run in the Supabase SQL Editor

-- ─── CHANNELS ──────────────────────────────────────────────────
-- Drop the open policy
DROP POLICY IF EXISTS "chat_channels_all" ON public.chat_channels;

-- Read: any authenticated user
CREATE POLICY "chat_channels_select"
  ON public.chat_channels FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Create: any authenticated user (created_by must be oneself)
CREATE POLICY "chat_channels_insert"
  ON public.chat_channels FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (created_by IS NULL OR created_by = auth.uid()));

-- Update: only the channel creator
CREATE POLICY "chat_channels_update"
  ON public.chat_channels FOR UPDATE
  USING (created_by = auth.uid());

-- Delete: only the channel creator
CREATE POLICY "chat_channels_delete"
  ON public.chat_channels FOR DELETE
  USING (created_by = auth.uid());

-- ─── MESSAGES ─────────────────────────────────────────────
-- Drop the open policy
DROP POLICY IF EXISTS "chat_messages_all" ON public.chat_messages;

-- Read: any authenticated user
CREATE POLICY "chat_messages_select"
  ON public.chat_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Create: only with one's own user_id
CREATE POLICY "chat_messages_insert"
  ON public.chat_messages FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Update: only one's own messages
CREATE POLICY "chat_messages_update"
  ON public.chat_messages FOR UPDATE
  USING (user_id = auth.uid());

-- Delete: only one's own messages
CREATE POLICY "chat_messages_delete"
  ON public.chat_messages FOR DELETE
  USING (user_id = auth.uid());
