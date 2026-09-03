-- Lot KPIs manuels (GO contrat Lidia 22/07) : mesures MENSUELLES saisies par client
-- pour les KPIs du catalogue sans source automatique (tickets, CSAT, panier moyen…).
-- 1 point / (client, kpi, mois) — re-saisir le même mois = corriger (upsert).
-- Alimente : fiche client (saisie + historique), dashboard (agrégat org), copils (courbes).
-- RLS org-wide modèle quotes : toute l'équipe lit/écrit, delete = auteur ou owner (FB-05).
-- À appliquer PRÉPROD (wxbape…) PUIS PROD (hcqnin…), GO par marche, AVANT le push front.

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

-- Lecture : toutes les mesures de MON org (partage cross-CSM, FB-05)
DROP POLICY IF EXISTS client_metrics_select_org ON public.client_metrics;
CREATE POLICY client_metrics_select_org ON public.client_metrics FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Création : en tant que soi, dans son org
DROP POLICY IF EXISTS client_metrics_insert_org ON public.client_metrics;
CREATE POLICY client_metrics_insert_org ON public.client_metrics FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Correction : tout membre de l'org (upsert du même mois par un collègue)
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

-- Suppression : le dernier éditeur, ou l'owner de l'org
DROP POLICY IF EXISTS client_metrics_delete_own ON public.client_metrics;
CREATE POLICY client_metrics_delete_own ON public.client_metrics FOR DELETE
  USING (
    user_id = auth.uid()
    OR (SELECT org_role FROM public.profiles WHERE id = auth.uid()) = 'owner'
  );

-- Contrôles post-apply :
--   SELECT policyname, cmd FROM pg_policies WHERE tablename='client_metrics' ORDER BY policyname;
--     -- attendu : client_metrics_delete_own(DELETE), client_metrics_insert_org(INSERT),
--     --           client_metrics_select_org(SELECT), client_metrics_update_org(UPDATE)
--   SELECT conname FROM pg_constraint WHERE conrelid='public.client_metrics'::regclass ORDER BY conname;
--     -- attendu : client_metrics_first_of_month, client_metrics_unique (+ PK/FK)
