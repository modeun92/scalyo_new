-- A-06/C-03 — 12 juillet 2026
-- Notifications locale-agnostiques. Jusqu'ici title/body étaient rendus en
-- français à la génération (notifications.js) et persistés tels quels → un
-- testeur KO/EN recevait des notifications en français. On stocke désormais
-- type + payload (snapshot des valeurs au moment de l'alerte) et title/body
-- sont rendus à la locale du lecteur côté frontend (src/lib/notifText.js).
--
-- ORDRE DE DÉPLOIEMENT OBLIGATOIRE : cette migration AVANT le deploy frontend.
-- generateFromData insère désormais la colonne payload ; sans la colonne,
-- l'insert échoue ("column payload does not exist").
--
-- Appliqué : PRÉPROD (à faire) . PROD : au merge validé (R8).

-- 1) Colonne payload (idempotent, défaut '{}' → lignes existantes non nulles).
alter table public.notifications
  add column if not exists payload jsonb not null default '{}'::jsonb;

-- 2) Migration des lignes existantes.
--    Ce sont des alertes transitoires (FR figé, sans payload). generateFromData
--    dedup par (type, target_id) : tant qu'elles existent, aucune ligne payload
--    ne se recree. On les purge ; le client les regenere AVEC payload au prochain
--    load. Aucune donnee utilisateur (chat, clients, taches...) n'est touchee.
delete from public.notifications;
