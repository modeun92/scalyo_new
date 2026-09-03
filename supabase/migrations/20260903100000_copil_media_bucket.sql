-- COPIL-IMAGE-EXPORT (contrat COPIL-RENDER-EXPORT, D1① — GO Lidia 03/09/2026).
-- Bucket PRIVÉ `copil-media` : images des blocs COPIL, exportées ensuite dans le
-- PowerPoint. Objet = `<user_id>/<copil_id>/<block_id>.<ext>`. Les policies
-- n'autorisent chaque utilisateur QUE sur son propre préfixe (même doctrine que
-- la RLS `copils` : user_id = auth.uid()). Lecture par URL signée (1 h) côté front.
-- À appliquer PRÉPROD (wxbapegyivoolzsckovs) PUIS PROD (hcqninmpmzpqjtedyjyj),
-- GO par marche, AVANT le déploiement du front qui téléverse. Idempotente.
--
-- Contrôle après application :
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'copil-media';
--   -- attendu : 1 ligne, public = false, 5242880, {image/png,image/jpeg,image/webp}
--   select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'copil_media_%';
--   -- attendu : 4 lignes

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('copil-media', 'copil-media', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists copil_media_select_own on storage.objects;
create policy copil_media_select_own on storage.objects for select to authenticated
  using (bucket_id = 'copil-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists copil_media_insert_own on storage.objects;
create policy copil_media_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'copil-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists copil_media_update_own on storage.objects;
create policy copil_media_update_own on storage.objects for update to authenticated
  using (bucket_id = 'copil-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'copil-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists copil_media_delete_own on storage.objects;
create policy copil_media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'copil-media' and (storage.foldername(name))[1] = auth.uid()::text);
