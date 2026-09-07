-- Scalyo - schema reconstructed from the SQL migrations + every CRUD call site in the app.
-- Generated 2026-09-07.
--
-- *** NOT A MIGRATION. Do not move this file into supabase/migrations/. ***
-- It is a reference: running it against a live database is not the intent and the
-- inferred halves below are not safe to apply.
--
--   no marker            column AND type are verbatim from a CREATE/ALTER TABLE in the repo
--   'type inferred'      column NAME is proven by a real query; the TYPE is guessed from naming
--   'single call site'   as above, and only one place in the code references it
--
-- NOT recoverable from code, and therefore absent everywhere below: NOT NULL, DEFAULT,
-- FOREIGN KEY, UNIQUE, CHECK, indexes, and every RLS policy.
-- Narrative version with evidence per column: DATABASE_TABLES_REPORT.md
-- Entity-relationship diagrams: DATABASE_DIAGRAM.md

-- ==========================================================================
-- activity_log   [6 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.activity_log (
  action                     text,   -- type inferred, single call site
  changes                    text,   -- type inferred, single call site
  entity_id                  uuid,   -- type inferred, single call site
  entity_type                text,   -- type inferred, single call site
  organization_id            uuid,   -- type inferred, single call site
  user_id                    uuid   -- type inferred, single call site
);

-- ==========================================================================
-- ai_conversations   [6 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id                         uuid,   -- type inferred
  messages                   jsonb,   -- type inferred
  module                     text,   -- type inferred
  title                      text,   -- type inferred, single call site
  updated_at                 timestamptz,   -- type inferred
  user_id                    uuid   -- type inferred
);

-- ==========================================================================
-- ai_messages   [6 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id                         uuid,   -- type inferred
  content                    text,   -- type inferred
  created_at                 timestamptz,   -- type inferred
  module                     text,   -- type inferred
  role                       text,   -- type inferred
  user_id                    uuid   -- type inferred
);

-- ==========================================================================
-- alpha_feedback   [3 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.alpha_feedback (
  category                   text,   -- type inferred, single call site
  message                    text,   -- type inferred, single call site
  page_route                 text   -- type inferred, single call site
);

-- ==========================================================================
-- api_keys   [6 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  expires_at                 timestamptz,   -- type inferred
  is_active                  boolean,   -- type inferred
  key_hash                   text,   -- type inferred
  last_used_at               timestamptz,   -- type inferred, single call site
  scopes                     text,   -- type inferred
  user_id                    uuid   -- type inferred
);

-- ==========================================================================
-- chat_channel_members   [3 columns | 3 confirmed | CREATE TABLE in repo]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  added_at                   timestamptz not null default now(),
  channel_id                 uuid not null references public.chat_channels(id) on delete cascade,
  user_id                    uuid not null references auth.users(id) on delete cascade
);

-- ==========================================================================
-- chat_channels   [9 columns | 9 confirmed | CREATE TABLE in repo]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  description                text DEFAULT '',
  dm_key                     text,
  name                       text NOT NULL,
  organization_id            uuid,
  team_id                    uuid,
  type                       text NOT NULL DEFAULT 'channel' CHECK (type IN ('channel', 'dm'))
);

-- ==========================================================================
-- chat_messages   [12 columns | 12 confirmed | CREATE TABLE in repo]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachments                jsonb DEFAULT '[]',
  author_name                text NOT NULL DEFAULT '',
  channel_id                 uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  content                    text NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  edited_at                  timestamptz,
  organization_id            uuid,
  pinned                     boolean NOT NULL DEFAULT false,
  reactions                  jsonb DEFAULT '[]',
  reply_to                   uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  user_id                    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ==========================================================================
-- client_metrics   [9 columns | 9 confirmed | CREATE TABLE in repo]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.client_metrics (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  kpi_id                     text NOT NULL,
  organization_id            uuid,
  period                     date NOT NULL,
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  user_id                    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  value                      numeric NOT NULL
);

-- ==========================================================================
-- client_notes   [8 columns | 8 confirmed | CREATE TABLE in repo]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.client_notes (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name                text NOT NULL DEFAULT '',
  client_id                  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  content                    text NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  kind                       text NOT NULL DEFAULT 'note',
  organization_id            uuid
);

-- ==========================================================================
-- clients   [21 columns | 1 confirmed | ALTER only + code]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id                         uuid,   -- type inferred
  arr                        numeric,   -- type inferred
  churn_risk                 numeric,   -- type inferred
  churned_at                 timestamptz,   -- type inferred
  contacts                   jsonb,   -- type inferred
  created_at                 timestamptz,   -- type inferred
  csm                        text,   -- type inferred
  csm_id                     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  health                     numeric,   -- type inferred
  industry                   text,   -- type inferred
  lifecycle                  text,   -- type inferred, single call site
  logo                       text,   -- type inferred
  mrr                        numeric,   -- type inferred
  name                       text,   -- type inferred
  notes                      text,   -- type inferred
  nps                        numeric,   -- type inferred
  pipeline_stage             text,   -- type inferred, single call site
  renewal_date               date,   -- type inferred
  status                     text,   -- type inferred
  updated_at                 timestamptz,   -- type inferred
  user_id                    uuid   -- type inferred
);

-- ==========================================================================
-- copils   [18 columns | 1 confirmed | ALTER only + code]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.copils (
  id                         uuid,   -- type inferred
  blocks                     jsonb,   -- type inferred
  client_id                  uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_logo                text,   -- type inferred
  client_name                text,   -- type inferred
  color                      text,   -- type inferred
  created_at                 timestamptz,   -- type inferred
  date                       date,   -- type inferred
  error                      text,   -- type inferred, single call site
  lang                       text,   -- type inferred
  period                     date,   -- type inferred
  presenter                  text,   -- type inferred
  reverted                   boolean,   -- type inferred, single call site
  share_token                text,   -- type inferred
  subtitle                   text,   -- type inferred
  title                      text,   -- type inferred
  updated_at                 timestamptz,   -- type inferred
  user_id                    uuid   -- type inferred, single call site
);

-- ==========================================================================
-- email_templates   [7 columns | 1 confirmed | ALTER only + code]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.email_templates (
  id                         uuid,   -- type inferred
  created_at                 timestamptz,   -- type inferred
  created_by                 text,   -- type inferred, single call site
  failed                     boolean,   -- type inferred, single call site
  organization_id            uuid,
  owner_id                   uuid,   -- type inferred, single call site
  updated_at                 timestamptz   -- type inferred, single call site
);

-- ==========================================================================
-- invitations   [8 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.invitations (
  id                         uuid,   -- type inferred, single call site
  email                      text,   -- type inferred, single call site
  expires_at                 timestamptz,   -- type inferred, single call site
  invited_by                 text,   -- type inferred, single call site
  organization_id            uuid,   -- type inferred
  role                       text,   -- type inferred, single call site
  status                     text,   -- type inferred, single call site
  token                      text   -- type inferred, single call site
);

-- ==========================================================================
-- notifications   [6 columns | 1 confirmed | ALTER only + code]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id                         uuid,   -- type inferred
  created_at                 timestamptz,   -- type inferred
  payload                    jsonb not null default '{}'::jsonb,
  read                       boolean,   -- type inferred
  target_id                  uuid,   -- type inferred
  type                       text   -- type inferred
);

-- ==========================================================================
-- org_email_config   [6 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.org_email_config (
  id                         uuid,   -- type inferred
  owner_id                   uuid,   -- type inferred
  resend_api_key             text,   -- type inferred
  sender_domain              text,   -- type inferred
  sender_name                text,   -- type inferred
  updated_at                 timestamptz   -- type inferred, single call site
);

-- ==========================================================================
-- org_integrations   [7 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.org_integrations (
  id                         uuid,   -- type inferred
  config                     jsonb,   -- type inferred
  connected_at               timestamptz,   -- type inferred
  integration_id             text,   -- type inferred
  status                     text,   -- type inferred
  updated_at                 timestamptz,   -- type inferred
  user_id                    uuid   -- type inferred
);

-- ==========================================================================
-- organization_members   [6 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.organization_members (
  id                         uuid,   -- type inferred, single call site
  can_send_email             boolean,   -- type inferred
  joined_at                  timestamptz,   -- type inferred
  organization_id            uuid,   -- type inferred
  role                       text,   -- type inferred
  user_id                    uuid   -- type inferred
);

-- ==========================================================================
-- organizations   [10 columns | 1 confirmed | ALTER only + code]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id                         uuid,   -- type inferred
  is_founding                boolean,   -- type inferred
  max_clients                integer,   -- type inferred
  name                       text,   -- type inferred
  owner_id                   uuid,   -- type inferred
  oxygen_team_enabled        boolean not null default false,
  plan                       text,   -- type inferred
  seats_paid                 integer,   -- type inferred
  stripe_subscription_id     text,   -- type inferred
  trial_ends_at              timestamptz   -- type inferred
);

-- ==========================================================================
-- oxygen_checkins   [6 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.oxygen_checkins (
  date                       date,   -- type inferred
  energy                     text,   -- type inferred
  felt_load                  text,   -- type inferred
  mood                       text,   -- type inferred
  user_id                    uuid,   -- type inferred
  word                       text   -- type inferred
);

-- ==========================================================================
-- oxygen_daily   [4 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.oxygen_daily (
  date                       date,   -- type inferred
  index                      text,   -- type inferred
  load_score                 numeric,   -- type inferred
  user_id                    uuid   -- type inferred
);

-- ==========================================================================
-- oxygen_recoveries   [8 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.oxygen_recoveries (
  id                         uuid,   -- type inferred
  completed                  boolean,   -- type inferred
  created_at                 timestamptz,   -- type inferred
  date                       date,   -- type inferred
  duration_s                 text,   -- type inferred
  kind                       text,   -- type inferred
  progress_count             integer,   -- type inferred
  user_id                    uuid   -- type inferred
);

-- ==========================================================================
-- planning_events   [8 columns | 2 confirmed | ALTER only + code]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.planning_events (
  id                         uuid,   -- type inferred
  client_id                  uuid,   -- type inferred
  color                      text,   -- type inferred, single call site
  end_at                     timestamptz,   -- type inferred, single call site
  recurrence                 text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
  series_id                  uuid,
  start_at                   timestamptz,   -- type inferred
  title                      text   -- type inferred
);

-- ==========================================================================
-- playbooks   [13 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.playbooks (
  id                         uuid,   -- type inferred
  client_id                  uuid,   -- type inferred
  color                      text,   -- type inferred
  completed_at               timestamptz,   -- type inferred
  created_at                 timestamptz,   -- type inferred
  csm_id                     uuid,   -- type inferred
  icon                       text,   -- type inferred
  started_at                 timestamptz,   -- type inferred
  status                     text,   -- type inferred
  steps                      text,   -- type inferred
  template_id                text,   -- type inferred
  template_key               text,   -- type inferred
  user_id                    uuid   -- type inferred, single call site
);

-- ==========================================================================
-- profiles   [16 columns | 1 confirmed | ALTER only + code]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                         uuid,   -- type inferred
  company_name               text,   -- type inferred
  first_name                 text,   -- type inferred
  is_alpha_tester            boolean,   -- type inferred, single call site
  last_name                  text,   -- type inferred
  locale                     text,   -- type inferred
  onboarding_completed       boolean,   -- type inferred, single call site
  org_role                   text,   -- type inferred, single call site
  organization_id            uuid,   -- type inferred
  plan                       text,   -- type inferred
  region                     text,   -- type inferred, single call site
  resend_api_key             text,
  stripe_customer_id         text,   -- type inferred, single call site
  stripe_subscription_id     text,   -- type inferred
  trial_started_at           timestamptz,   -- type inferred, single call site
  trial_used                 boolean   -- type inferred, single call site
);

-- ==========================================================================
-- projects   [6 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id                         uuid,   -- type inferred
  color                      text,   -- type inferred, single call site
  created_at                 timestamptz,   -- type inferred
  name                       text,   -- type inferred, single call site
  status                     text,   -- type inferred, single call site
  user_id                    uuid   -- type inferred
);

-- ==========================================================================
-- promo_codes   [6 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id                         uuid,   -- type inferred, single call site
  activated_at               timestamptz,   -- type inferred, single call site
  code                       text,   -- type inferred, single call site
  expires_at                 timestamptz,   -- type inferred, single call site
  organization_id            uuid,   -- type inferred, single call site
  status                     text   -- type inferred, single call site
);

-- ==========================================================================
-- quotes   [13 columns | 13 confirmed | CREATE TABLE in repo]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.quotes (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount                     numeric DEFAULT 0,
  client_id                  uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  company                    text DEFAULT '',
  country                    text DEFAULT 'FR',
  created_at                 timestamptz NOT NULL DEFAULT now(),
  currency                   text DEFAULT '€',
  notes                      text DEFAULT '',
  organization_id            uuid,
  status                     text NOT NULL DEFAULT 'draft',
  tax                        numeric DEFAULT 0,
  title                      text NOT NULL DEFAULT '',
  user_id                    uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ==========================================================================
-- roadmaps   [9 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.roadmaps (
  id                         uuid,   -- type inferred
  color                      text,   -- type inferred, single call site
  created_at                 timestamptz,   -- type inferred
  icon                       text,   -- type inferred, single call site
  milestones                 jsonb,   -- type inferred
  name                       text,   -- type inferred, single call site
  status                     text,   -- type inferred, single call site
  template_id                text,   -- type inferred, single call site
  user_id                    uuid   -- type inferred, single call site
);

-- ==========================================================================
-- sent_emails   [13 columns | 13 confirmed | CREATE TABLE in repo]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.sent_emails (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  from_name                  text,
  last_opened_at             timestamptz,
  open_count                 integer NOT NULL DEFAULT 0,
  opened_at                  timestamptz,
  resend_id                  text,
  sent_at                    timestamptz NOT NULL DEFAULT now(),
  subject                    text NOT NULL,
  template_id                integer,
  to_email                   text NOT NULL,
  tracking_id                uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ==========================================================================
-- snapshots   [4 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.snapshots (
  id                         uuid,   -- type inferred
  date                       date,   -- type inferred
  kpis                       jsonb,   -- type inferred
  user_id                    uuid   -- type inferred, single call site
);

-- ==========================================================================
-- tasks   [30 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id                         uuid,   -- type inferred
  actual_hours               numeric,   -- type inferred, single call site
  assignee                   text,   -- type inferred, single call site
  client_id                  uuid,   -- type inferred, single call site
  color                      text,   -- type inferred, single call site
  created_at                 timestamptz,   -- type inferred
  description                text,   -- type inferred, single call site
  difficulty                 text,   -- type inferred, single call site
  due_date                   date,   -- type inferred, single call site
  end_date                   date,   -- type inferred, single call site
  expected_hours             numeric,   -- type inferred, single call site
  finished                   boolean,   -- type inferred, single call site
  importance                 text,   -- type inferred, single call site
  level                      text,   -- type inferred, single call site
  max_hours                  numeric,   -- type inferred, single call site
  min_hours                  numeric,   -- type inferred, single call site
  name                       text,   -- type inferred, single call site
  parent_id                  uuid,   -- type inferred
  pended                     text,   -- type inferred, single call site
  priority                   text,   -- type inferred, single call site
  project_id                 uuid,   -- type inferred
  start_date                 date,   -- type inferred, single call site
  status                     text,   -- type inferred
  subtasks                   text,   -- type inferred, single call site
  tags                       jsonb,   -- type inferred, single call site
  task_type                  text,   -- type inferred, single call site
  title                      text,   -- type inferred
  updated_at                 timestamptz,   -- type inferred, single call site
  urgency                    text,   -- type inferred, single call site
  user_id                    uuid   -- type inferred
);

-- ==========================================================================
-- team_members   [2 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.team_members (
  created_at                 timestamptz,   -- type inferred
  user_id                    uuid   -- type inferred
);

-- ==========================================================================
-- user_profiles   [21 columns | 21 confirmed | CREATE TABLE in repo]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id                         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_tone                    TEXT DEFAULT 'professional',
  avg_contract_value         INTEGER DEFAULT 0,
  challenges                 JSONB DEFAULT '[]'::jsonb,
  company_size               TEXT DEFAULT 'smb',
  created_at                 TIMESTAMPTZ DEFAULT now(),
  currency                   TEXT DEFAULT 'EUR',
  custom_data                JSONB DEFAULT '{}'::jsonb,
  goals                      JSONB DEFAULT '[]'::jsonb,
  industry                   TEXT,
  industry_custom            TEXT,
  market                     TEXT DEFAULT 'b2b_saas',
  onboarding_completed       BOOLEAN DEFAULT false,
  portfolio_size             INTEGER DEFAULT 0,
  preferred_language         TEXT DEFAULT 'fr',
  processes                  JSONB DEFAULT '{}'::jsonb,
  role                       TEXT DEFAULT 'csm',
  role_custom                TEXT,
  seniority                  TEXT DEFAULT 'mid',
  tools                      JSONB DEFAULT '[]'::jsonb,
  updated_at                 TIMESTAMPTZ DEFAULT now()
);

-- ==========================================================================
-- webhooks   [5 columns | 0 confirmed | code only]
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.webhooks (
  is_active                  boolean,   -- type inferred
  last_triggered_at          timestamptz,   -- type inferred, single call site
  secret                     text,   -- type inferred
  trigger_count              integer,   -- type inferred, single call site
  user_id                    uuid   -- type inferred
);
