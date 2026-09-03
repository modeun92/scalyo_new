-- Migration: Add resend_api_key to profiles table
-- Run in Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS resend_api_key text;

-- RLS: users can only read/write their own API key
-- (already covered by existing profiles RLS policies)

-- Encrypt at rest note: resend_api_key is stored as plaintext
-- Consider using Supabase Vault for production encryption
COMMENT ON COLUMN public.profiles.resend_api_key
  IS 'Customer Resend API key for Email Studio. Each customer manages their own Resend account.';
