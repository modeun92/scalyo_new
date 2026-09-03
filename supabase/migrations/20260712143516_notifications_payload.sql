-- A-06/C-03 — 12 July 2026
-- Locale-agnostic notifications. Until now title/body were rendered in
-- French at generation time (notifications.js) and persisted as such → a
-- KO/EN tester received notifications in French. We now store
-- type + payload (snapshot of the values at alert time) and title/body
-- are rendered in the reader's locale on the front end (src/lib/notifText.js).
--
-- MANDATORY DEPLOYMENT ORDER: this migration BEFORE the front-end deploy.
-- generateFromData now inserts the payload column; without the column,
-- the insert fails ("column payload does not exist").
--
-- Applied: PRE-PROD (to do). PROD: on approved merge (R8).

-- 1) payload column (idempotent, default '{}' → existing rows are non-null).
alter table public.notifications
  add column if not exists payload jsonb not null default '{}'::jsonb;

-- 2) Migration of the existing rows.
--    These are transient alerts (frozen FR, no payload). generateFromData
--    dedups by (type, target_id): as long as they exist, no payload row
--    can be recreated. We purge them; the client regenerates them WITH a payload at the next
--    load. No user data (chat, clients, tasks...) is touched.
delete from public.notifications;
