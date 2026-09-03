-- FB-03 v2 + FB-05 (arbitrages Lidia 20/07, feedback « pop-up + notes + tout CSM édite ») :
--   1) client_notes : notes libres horodatées par CSM (call / email / réunion / note),
--      visibles ET ajoutables par TOUT membre de l'org (continuité de service).
--   2) clients : ÉCRITURE org-wide — n'importe quel CSM de l'org peut éditer un client
--      (pas seulement le créateur/CSM assigné). Remplace clients_update_own_or_csm.
--
-- Modèle RLS calqué sur les policies clients déjà en prod (sous-requête profiles),
-- aucune fonction helper. À appliquer PRÉPROD (wxbape…) PUIS PROD (hcqnin…), GO par marche.

-- ── 1. Table des notes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid,
  author_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name     text NOT NULL DEFAULT '',
  kind            text NOT NULL DEFAULT 'note',   -- note | call | email | meeting
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client ON public.client_notes (client_id, created_at DESC);

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

-- Lecture : toutes les notes de MON org (continuité entre CSM)
DROP POLICY IF EXISTS client_notes_select_org ON public.client_notes;
CREATE POLICY client_notes_select_org ON public.client_notes FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Ajout : tout membre de l'org, en tant que lui-même
DROP POLICY IF EXISTS client_notes_insert_org ON public.client_notes;
CREATE POLICY client_notes_insert_org ON public.client_notes FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Suppression : l'auteur de la note, ou l'owner de l'org
DROP POLICY IF EXISTS client_notes_delete_own ON public.client_notes;
CREATE POLICY client_notes_delete_own ON public.client_notes FOR DELETE
  USING (
    author_id = auth.uid()
    OR (SELECT org_role FROM public.profiles WHERE id = auth.uid()) = 'owner'
  );

-- ── 2. Écriture clients org-wide ──────────────────────────────────────
-- Avant (migration 20260720230000) : clients_update_own_or_csm (créateur OU csm_id).
-- Feedback Lidia : tout CSM de l'org doit pouvoir compléter une fiche → org-wide.
DROP POLICY IF EXISTS clients_update_own_or_csm ON public.clients;
CREATE POLICY clients_update_org ON public.clients FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Contrôles post-application :
-- SELECT policyname, cmd FROM pg_policies WHERE tablename='client_notes' ORDER BY policyname;
--   -- attendu : client_notes_delete_own(DELETE), client_notes_insert_org(INSERT), client_notes_select_org(SELECT)
-- SELECT policyname, cmd FROM pg_policies WHERE tablename='clients' ORDER BY policyname;
--   -- attendu : clients_delete_own(DELETE), clients_insert_own(INSERT), clients_org_manage(ALL),
--   --           clients_select_org(SELECT), clients_update_org(UPDATE)
