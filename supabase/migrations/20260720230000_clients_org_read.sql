-- FB-05 (D1 decided by Lidia on 20/07) — cross-CSM visibility of clients:
-- org-wide READ for every member of the org; WRITE restricted to the
-- creator (user_id) and the assigned CSM (csm_id, B-04 column); the owner keeps
-- everything via clients_org_manage (existing ALL policy, untouched).
--
-- State BEFORE (read in SQL on pre-prod + prod on 20/07):
--   clients_org_manage (ALL)  : org-scoped owner — KEPT
--   users_own_clients  (ALL)  : auth.uid() = user_id — REPLACED by 4 explicit policies
--
-- To be applied: PRE-PROD (wxbape…) THEN PROD (hcqnin…) — SQL editor, GO per step (R8).

DROP POLICY IF EXISTS users_own_clients ON public.clients;

-- Read: their own clients + all the clients of THEIR org (org not null)
CREATE POLICY clients_select_org ON public.clients FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Create: only for oneself (behaviour unchanged)
CREATE POLICY clients_insert_own ON public.clients FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Update: creator OR assigned CSM (the owner goes through clients_org_manage)
CREATE POLICY clients_update_own_or_csm ON public.clients FOR UPDATE
  USING (user_id = auth.uid() OR csm_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR csm_id = auth.uid());

-- Delete: creator only (the owner goes through clients_org_manage)
CREATE POLICY clients_delete_own ON public.clients FOR DELETE
  USING (user_id = auth.uid());

-- Post-application checks:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename='clients' ORDER BY policyname;
--   -- expected: clients_delete_own(DELETE), clients_insert_own(INSERT),
--   --           clients_org_manage(ALL), clients_select_org(SELECT), clients_update_own_or_csm(UPDATE)
