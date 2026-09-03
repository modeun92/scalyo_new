-- D-08 / FB (feedback from Lidia 20/07 "move the quotes into the database"): quotes lived
-- in localStorage (device-local) → invisible to the other CSMs. We move them into the database
-- with org-wide RLS (shared like the notes: the whole team reads/edits).
-- RLS model modeled on clients (profiles subquery), no helper function.
-- To be applied on PRE-PROD (wxbape…) THEN PROD (hcqnin…), GO per step.

CREATE TABLE IF NOT EXISTS public.quotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  organization_id uuid,
  client_id       uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  title           text NOT NULL DEFAULT '',
  company         text DEFAULT '',
  amount          numeric DEFAULT 0,
  tax             numeric DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft',   -- draft | sent | won | lost
  notes           text DEFAULT '',
  country         text DEFAULT 'FR',
  currency        text DEFAULT '€',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotes_org ON public.quotes (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON public.quotes (client_id);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- Read: all the quotes of MY org (cross-CSM sharing)
DROP POLICY IF EXISTS quotes_select_org ON public.quotes;
CREATE POLICY quotes_select_org ON public.quotes FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Create: as oneself, within one's org
DROP POLICY IF EXISTS quotes_insert_org ON public.quotes;
CREATE POLICY quotes_insert_org ON public.quotes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Update: any member of the org (complete / change the status of a quote)
DROP POLICY IF EXISTS quotes_update_org ON public.quotes;
CREATE POLICY quotes_update_org ON public.quotes FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Delete: the creator, or the org owner
DROP POLICY IF EXISTS quotes_delete_own ON public.quotes;
CREATE POLICY quotes_delete_own ON public.quotes FOR DELETE
  USING (
    user_id = auth.uid()
    OR (SELECT org_role FROM public.profiles WHERE id = auth.uid()) = 'owner'
  );

-- Check: SELECT policyname, cmd FROM pg_policies WHERE tablename='quotes' ORDER BY policyname;
--   -- expected: quotes_delete_own(DELETE), quotes_insert_org(INSERT), quotes_select_org(SELECT), quotes_update_org(UPDATE)
