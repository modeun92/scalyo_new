-- B-04 / G9-10 — clients.csm_id : l'assignation d'agent (CSM) n'était jamais persistée.
-- Le combobox écrivait un csmId local perdu au reload ; seule la colonne csm (text)
-- portait un nom libre. Baseline 20260624131657 relue le 18/07 : csm_id ABSENTE.
--
-- Backfill volontairement ABSENT : le mapping nom→uuid n'est pas fiable (homonymes,
-- renommages) — NULL = non assigné, les vues rendent déjà l'état vide honnêtement.
--
-- À appliquer : PRÉPROD (wxbape…) PUIS PROD (hcqnin…) — SQL editor, GO Lidia nommé (R8).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS csm_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_csm_id ON public.clients (csm_id);

-- Contrôles post-application :
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'clients' AND column_name = 'csm_id';          -- 1 ligne, uuid
-- SELECT count(*) AS assignes FROM public.clients WHERE csm_id IS NOT NULL;  -- 0 attendu
