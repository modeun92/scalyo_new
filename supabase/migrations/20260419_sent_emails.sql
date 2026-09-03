-- Migration: Create sent_emails table for Email Studio tracking
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.sent_emails (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_email        text NOT NULL,
  subject         text NOT NULL,
  template_id     integer,
  from_name       text,
  resend_id       text,
  tracking_id     uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  opened_at       timestamptz,
  last_opened_at  timestamptz,
  open_count      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS sent_emails_user_id_idx ON public.sent_emails(user_id);
CREATE INDEX IF NOT EXISTS sent_emails_tracking_id_idx ON public.sent_emails(tracking_id);

-- RLS: users can only see their own sent emails
ALTER TABLE public.sent_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sent emails"
  ON public.sent_emails FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sent emails"
  ON public.sent_emails FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can update tracking data (open counts)
CREATE POLICY "Service role can update tracking"
  ON public.sent_emails FOR UPDATE
  USING (true);
