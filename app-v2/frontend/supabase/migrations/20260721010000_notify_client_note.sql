-- Increment C (feedback Lidia 21/07 : « le propriétaire d'un client doit être
-- prévenu quand un collègue ajoute une note/info sur SON client »).
--
-- Contexte RLS (vérifié) : notifications impose INSERT `user_id = auth.uid()` →
-- l'app ne peut PAS créer une notif POUR un autre utilisateur (le propriétaire).
-- Solution : trigger SECURITY DEFINER (s'exécute avec les droits du définisseur,
-- contourne proprement ce RLS côté serveur) — SANS élargir aucune policy.
--
-- Comportement : à chaque INSERT dans client_notes, si l'auteur ≠ le propriétaire
-- du client (COALESCE(csm_id, user_id) ; user_id est NOT NULL → jamais null), on
-- crée une notification in-app POUR le propriétaire, ciblée sur la fiche client.
-- Pas d'email (v1). `SET search_path = public` = durcissement SECURITY DEFINER.
--
-- À appliquer PRÉPROD (wxbape…) PUIS PROD (hcqninmpmzpqjtedyjyj), GO par marche.

CREATE OR REPLACE FUNCTION public.notify_client_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner       uuid;
  v_client_name text;
BEGIN
  -- Propriétaire = CSM assigné, sinon le créateur de la fiche
  SELECT COALESCE(csm_id, user_id), name
    INTO v_owner, v_client_name
    FROM public.clients
    WHERE id = NEW.client_id;

  -- Rien si : pas de propriétaire, auteur inconnu, ou auteur = propriétaire (self)
  IF v_owner IS NULL OR NEW.author_id IS NULL OR v_owner = NEW.author_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (user_id, type, icon, title, body, payload, target_id, route, read)
  VALUES (
    v_owner,
    'client_activity',
    '📝',
    '',   -- title/body legacy laissés vides : rendu localisé via payload (notifText.js)
    '',
    jsonb_build_object(
      'client_name', v_client_name,
      'author_name', NEW.author_name,
      'kind',        NEW.kind
    ),
    NEW.client_id::text,
    '/app/clients/' || NEW.client_id::text,
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_client_note ON public.client_notes;
CREATE TRIGGER trg_notify_client_note
  AFTER INSERT ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_note();

-- Contrôles post-application :
--   SELECT tgname FROM pg_trigger
--     WHERE tgrelid = 'public.client_notes'::regclass AND NOT tgisinternal;
--     -- attendu : trg_notify_client_note
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'notify_client_note';
--     -- attendu : notify_client_note | t  (prosecdef = SECURITY DEFINER)
