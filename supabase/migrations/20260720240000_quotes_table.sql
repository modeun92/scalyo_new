-- D-08 / FB (feedback Lidia 20/07 « migrer les devis en base ») : les devis vivaient
-- en localStorage (device-local) → invisibles pour les autres CSM. On les passe en base
-- avec RLS org-wide (partagés comme les notes : toute l'équipe lit/édite).
-- Modèle RLS calqué sur clients (sous-requête profiles), aucune fonction helper.
-- À appliquer PRÉPROD (wxbape…) PUIS PROD (hcqnin…), GO par marche.

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

-- Lecture : tous les devis de MON org (partage cross-CSM)
DROP POLICY IF EXISTS quotes_select_org ON public.quotes;
CREATE POLICY quotes_select_org ON public.quotes FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Création : en tant que soi, dans son org
DROP POLICY IF EXISTS quotes_insert_org ON public.quotes;
CREATE POLICY quotes_insert_org ON public.quotes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Modification : tout membre de l'org (compléter / changer le statut d'un devis)
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

-- Suppression : le créateur, ou l'owner de l'org
DROP POLICY IF EXISTS quotes_delete_own ON public.quotes;
CREATE POLICY quotes_delete_own ON public.quotes FOR DELETE
  USING (
    user_id = auth.uid()
    OR (SELECT org_role FROM public.profiles WHERE id = auth.uid()) = 'owner'
  );

-- Contrôle : SELECT policyname, cmd FROM pg_policies WHERE tablename='quotes' ORDER BY policyname;
--   -- attendu : quotes_delete_own(DELETE), quotes_insert_org(INSERT), quotes_select_org(SELECT), quotes_update_org(UPDATE)
