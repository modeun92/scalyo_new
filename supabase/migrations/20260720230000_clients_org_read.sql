-- FB-05 (D1 arbitré par Lidia le 20/07) — visibilité cross-CSM des clients :
-- LECTURE org-wide pour tous les membres de l'org ; ÉCRITURE restreinte au
-- créateur (user_id) et au CSM assigné (csm_id, colonne B-04) ; l'owner garde
-- tout via clients_org_manage (policy ALL existante, non touchée).
--
-- État AVANT (lu en SQL préprod + prod le 20/07) :
--   clients_org_manage (ALL)  : owner org-scopé — CONSERVÉE
--   users_own_clients  (ALL)  : auth.uid() = user_id — REMPLACÉE par 4 policies explicites
--
-- À appliquer : PRÉPROD (wxbape…) PUIS PROD (hcqnin…) — SQL editor, GO par marche (R8).

DROP POLICY IF EXISTS users_own_clients ON public.clients;

-- Lecture : ses propres clients + tous les clients de SON org (org non nulle)
CREATE POLICY clients_select_org ON public.clients FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Création : uniquement pour soi (comportement inchangé)
CREATE POLICY clients_insert_own ON public.clients FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Modification : créateur OU CSM assigné (l'owner passe par clients_org_manage)
CREATE POLICY clients_update_own_or_csm ON public.clients FOR UPDATE
  USING (user_id = auth.uid() OR csm_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR csm_id = auth.uid());

-- Suppression : créateur uniquement (l'owner passe par clients_org_manage)
CREATE POLICY clients_delete_own ON public.clients FOR DELETE
  USING (user_id = auth.uid());

-- Contrôles post-application :
-- SELECT policyname, cmd FROM pg_policies WHERE tablename='clients' ORDER BY policyname;
--   -- attendu : clients_delete_own(DELETE), clients_insert_own(INSERT),
--   --           clients_org_manage(ALL), clients_select_org(SELECT), clients_update_own_or_csm(UPDATE)
