-- R23 / feedback Lidia 20/07 (« historiser les copils dans la fiche client »).
-- La table copils préexiste (créée hors de ce checkout, appliquée en prod).
-- Le front mappe déjà client_id (dbToCopil / copilToDb) MAIS rien ne prouve que
-- la colonne existe en base — l'usage actuel ne l'exerce jamais (elle serait
-- silencieusement absente). On la garantit de façon IDEMPOTENTE :
--   • si la colonne existe déjà  → no-op, aucun risque
--   • si elle manque             → on l'ajoute (nullable, FK ON DELETE SET NULL)
-- À appliquer PRÉPROD PUIS PROD (hcqninmpmzpqjtedyjyj), GO par marche,
-- AVANT le déploiement frontend qui insère client_id à la création d'un copil.

ALTER TABLE public.copils
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_copils_client ON public.copils (client_id);

-- Contrôle :
--   SELECT column_name FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='copils' AND column_name='client_id';
--   -- attendu : 1 ligne (client_id)
