-- R23 / feedback from Lidia 20/07 ("log copils in the client record").
-- The copils table already exists (created outside this checkout, applied in production).
-- The front end already maps client_id (dbToCopil / copilToDb) BUT nothing proves that
-- the column exists in the database — the current usage never exercises it (it would be
-- silently absent). We guarantee it IDEMPOTENTLY:
--   • if the column already exists → no-op, no risk
--   • if it is missing            → we add it (nullable, FK ON DELETE SET NULL)
-- To be applied on PRE-PROD THEN PROD (hcqninmpmzpqjtedyjyj), GO per step,
-- BEFORE the front-end deployment that inserts client_id when creating a copil.

ALTER TABLE public.copils
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_copils_client ON public.copils (client_id);

-- Check:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='copils' AND column_name='client_id';
--   -- expected: 1 row (client_id)
