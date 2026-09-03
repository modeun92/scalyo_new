-- Manual KPIs batch (GO on the contract from Lidia 22/07): MONTHLY measurements entered per client
-- for the catalog KPIs without an automatic source (tickets, CSAT, average basket…).
-- 1 data point per (client, kpi, month) — re-entering the same month = correcting it (upsert).
-- Feeds: client record (entry + history), dashboard (org aggregate), copils (curves).
-- Org-wide RLS on the quotes model: the whole team reads/writes, delete = author or owner (FB-05).
-- To be applied on PRE-PROD (wxbape…) THEN PROD (hcqnin…), GO per step, BEFORE the front-end push.

CREATE TABLE IF NOT EXISTS public.client_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kpi_id          text NOT NULL,
  period          date NOT NULL,                 -- toujours le 1er du mois (mesure mensuelle)
  value           numeric NOT NULL,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- dernier éditeur
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_metrics_first_of_month CHECK (extract(day from period) = 1),
  CONSTRAINT client_metrics_unique UNIQUE (client_id, kpi_id, period)
);

CREATE INDEX IF NOT EXISTS idx_client_metrics_org ON public.client_metrics (organization_id);
CREATE INDEX IF NOT EXISTS idx_client_metrics_client ON public.client_metrics (client_id, kpi_id, period DESC);

ALTER TABLE public.client_metrics ENABLE ROW LEVEL SECURITY;

-- Read: all the measurements of MY org (cross-CSM sharing, FB-05)
DROP POLICY IF EXISTS client_metrics_select_org ON public.client_metrics;
CREATE POLICY client_metrics_select_org ON public.client_metrics FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Create: as oneself, within one's org
DROP POLICY IF EXISTS client_metrics_insert_org ON public.client_metrics;
CREATE POLICY client_metrics_insert_org ON public.client_metrics FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Update: any member of the org (upsert of the same month by a colleague)
DROP POLICY IF EXISTS client_metrics_update_org ON public.client_metrics;
CREATE POLICY client_metrics_update_org ON public.client_metrics FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Delete: the last editor, or the org owner
DROP POLICY IF EXISTS client_metrics_delete_own ON public.client_metrics;
CREATE POLICY client_metrics_delete_own ON public.client_metrics FOR DELETE
  USING (
    user_id = auth.uid()
    OR (SELECT org_role FROM public.profiles WHERE id = auth.uid()) = 'owner'
  );

-- Post-apply checks:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename='client_metrics' ORDER BY policyname;
--     -- expected: client_metrics_delete_own(DELETE), client_metrics_insert_org(INSERT),
--     --           client_metrics_select_org(SELECT), client_metrics_update_org(UPDATE)
--   SELECT conname FROM pg_constraint WHERE conrelid='public.client_metrics'::regclass ORDER BY conname;
--     -- expected: client_metrics_first_of_month, client_metrics_unique (+ PK/FK)
