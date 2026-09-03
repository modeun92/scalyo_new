-- PLAN-RECUR — récurrence matérialisée sur planning_events (lot bugs prod 01/08/2026)
-- recurrence : 'none' | 'daily' | 'weekly' | 'monthly' — posée sur CHAQUE occurrence de la série
-- series_id  : uuid partagé par toutes les occurrences d'une même série (NULL = événement isolé)
-- RLS : inchangée — les policies self-only existantes (users_own_events, auth.uid() = user_id)
--       couvrent les nouvelles colonnes ; suppression de série filtrée par RLS côté serveur.

ALTER TABLE public.planning_events
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly'));

ALTER TABLE public.planning_events
  ADD COLUMN IF NOT EXISTS series_id uuid;

CREATE INDEX IF NOT EXISTS idx_planning_events_series
  ON public.planning_events (series_id)
  WHERE series_id IS NOT NULL;

-- Contrôles post-apply (à exécuter en SELECT, résultats attendus) :
-- 1) SELECT column_name, data_type, is_nullable, column_default
--      FROM information_schema.columns
--      WHERE table_name = 'planning_events' AND column_name IN ('recurrence','series_id');
--    → 2 lignes : recurrence text NOT NULL default 'none' ; series_id uuid nullable
-- 2) SELECT indexname FROM pg_indexes
--      WHERE tablename = 'planning_events' AND indexname = 'idx_planning_events_series';
--    → 1 ligne
-- 3) SELECT count(*) FROM public.planning_events WHERE recurrence <> 'none';
--    → 0 (aucune donnée existante requalifiée)
