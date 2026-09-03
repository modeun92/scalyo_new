-- Scalyo user_profiles table
-- Flexible profile for AI context personalization
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'csm',
  role_custom TEXT,
  seniority TEXT DEFAULT 'mid',
  industry TEXT,
  industry_custom TEXT,
  company_size TEXT DEFAULT 'smb',
  market TEXT DEFAULT 'b2b_saas',
  portfolio_size INTEGER DEFAULT 0,
  avg_contract_value INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  goals JSONB DEFAULT '[]'::jsonb,
  challenges JSONB DEFAULT '[]'::jsonb,
  processes JSONB DEFAULT '{}'::jsonb,
  tools JSONB DEFAULT '[]'::jsonb,
  preferred_language TEXT DEFAULT 'fr',
  ai_tone TEXT DEFAULT 'professional',
  custom_data JSONB DEFAULT '{}'::jsonb,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile();

CREATE OR REPLACE FUNCTION update_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_update ON user_profiles;
CREATE TRIGGER on_profile_update
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_profile_timestamp();
