-- PLAN-RECUR — materialized recurrence on planning_events (production bug batch 01/08/2026)
-- recurrence: 'none' | 'daily' | 'weekly' | 'monthly' — set on EVERY occurrence of the series
-- series_id : uuid shared by all the occurrences of one series (NULL = standalone event)
-- RLS: unchanged — the existing self-only policies (users_own_events, auth.uid() = user_id)
--      cover the new columns; series deletion is filtered by RLS server-side.

ALTER TABLE public.planning_events
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly'));

ALTER TABLE public.planning_events
  ADD COLUMN IF NOT EXISTS series_id uuid;

CREATE INDEX IF NOT EXISTS idx_planning_events_series
  ON public.planning_events (series_id)
  WHERE series_id IS NOT NULL;

-- Post-apply checks (to be run as SELECTs, expected results):
-- 1) SELECT column_name, data_type, is_nullable, column_default
--      FROM information_schema.columns
--      WHERE table_name = 'planning_events' AND column_name IN ('recurrence','series_id');
--    → 2 rows: recurrence text NOT NULL default 'none'; series_id uuid nullable
-- 2) SELECT indexname FROM pg_indexes
--      WHERE tablename = 'planning_events' AND indexname = 'idx_planning_events_series';
--    → 1 row
-- 3) SELECT count(*) FROM public.planning_events WHERE recurrence <> 'none';
--    → 0 (no existing data reclassified)
