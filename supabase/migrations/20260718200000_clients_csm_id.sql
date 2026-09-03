-- B-04 / G9-10 — clients.csm_id: the agent (CSM) assignment was never persisted.
-- The combobox wrote a local csmId that was lost on reload; only the csm (text) column
-- carried a free-form name. Baseline 20260624131657 re-read on 18/07: csm_id ABSENT.
--
-- Backfill deliberately ABSENT: the name→uuid mapping is not reliable (homonyms,
-- renames) — NULL = unassigned, and the views already render the empty state honestly.
--
-- To be applied: PRE-PROD (wxbape…) THEN PROD (hcqnin…) — SQL editor, named GO from Lidia (R8).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS csm_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_csm_id ON public.clients (csm_id);

-- Post-application checks:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'clients' AND column_name = 'csm_id';          -- 1 row, uuid
-- SELECT count(*) AS assigned FROM public.clients WHERE csm_id IS NOT NULL;  -- 0 expected
