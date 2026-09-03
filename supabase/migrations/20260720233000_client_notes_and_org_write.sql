-- FB-03 v2 + FB-05 (decisions by Lidia 20/07, feedback "pop-up + notes + every CSM edits"):
--   1) client_notes: free-form timestamped notes per CSM (call / email / meeting / note),
--      visible AND addable by ANY member of the org (continuity of service).
--   2) clients: org-wide WRITE — any CSM of the org can edit a client
--      (not just the creator/assigned CSM). Replaces clients_update_own_or_csm.
--
-- RLS model modeled on the client policies already in production (profiles subquery),
-- no helper function. To be applied on PRE-PROD (wxbape…) THEN PROD (hcqnin…), GO per step.

-- ── 1. Notes table ─────────────────────────────────────────
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

-- Read: all the notes of MY org (continuity between CSMs)
DROP POLICY IF EXISTS client_notes_select_org ON public.client_notes;
CREATE POLICY client_notes_select_org ON public.client_notes FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Insert: any member of the org, as themselves
DROP POLICY IF EXISTS client_notes_insert_org ON public.client_notes;
CREATE POLICY client_notes_insert_org ON public.client_notes FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Delete: the author of the note, or the org owner
DROP POLICY IF EXISTS client_notes_delete_own ON public.client_notes;
CREATE POLICY client_notes_delete_own ON public.client_notes FOR DELETE
  USING (
    author_id = auth.uid()
    OR (SELECT org_role FROM public.profiles WHERE id = auth.uid()) = 'owner'
  );

-- ── 2. Org-wide client writes ───────────────────────────────
-- Before (migration 20260720230000): clients_update_own_or_csm (creator OR csm_id).
-- Feedback from Lidia: any CSM of the org must be able to complete a record → org-wide.
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

-- Post-application checks:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename='client_notes' ORDER BY policyname;
--   -- expected: client_notes_delete_own(DELETE), client_notes_insert_org(INSERT), client_notes_select_org(SELECT)
-- SELECT policyname, cmd FROM pg_policies WHERE tablename='clients' ORDER BY policyname;
--   -- expected: clients_delete_own(DELETE), clients_insert_own(INSERT), clients_org_manage(ALL),
--   --           clients_select_org(SELECT), clients_update_org(UPDATE)
