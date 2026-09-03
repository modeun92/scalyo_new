-- Increment C (feedback from Lidia 21/07: "the owner of a client must be
-- notified when a colleague adds a note/piece of info on THEIR client").
--
-- RLS context (verified): notifications enforce INSERT `user_id = auth.uid()` →
-- the app CANNOT create a notification FOR another user (the owner).
-- Solution: a SECURITY DEFINER trigger (runs with the definer's rights,
-- cleanly bypassing that RLS server-side) — WITHOUT widening any policy.
--
-- Behaviour: on every INSERT into client_notes, if the author ≠ the owner
-- of the client (COALESCE(csm_id, user_id); user_id is NOT NULL → never null), we
-- create an in-app notification FOR the owner, targeted at the client record.
-- No email (v1). `SET search_path = public` = SECURITY DEFINER hardening.
--
-- To be applied on PRE-PROD (wxbape…) THEN PROD (hcqninmpmzpqjtedyjyj), GO per step.

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
  -- Owner = assigned CSM, otherwise the creator of the record
  SELECT COALESCE(csm_id, user_id), name
    INTO v_owner, v_client_name
    FROM public.clients
    WHERE id = NEW.client_id;

  -- Nothing if: no owner, unknown author, or author = owner (self)
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

-- Post-application checks:
--   SELECT tgname FROM pg_trigger
--     WHERE tgrelid = 'public.client_notes'::regclass AND NOT tgisinternal;
--     -- expected: trg_notify_client_note
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'notify_client_note';
--     -- expected: notify_client_note | t  (prosecdef = SECURITY DEFINER)
