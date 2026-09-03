-- COPIL-IMAGE-EXPORT (contract COPIL-RENDER-EXPORT, D1① — GO from Lidia 03/09/2026).
-- PRIVATE bucket `copil-media`: images of the COPIL blocks, then exported into the
-- PowerPoint. Object = `<user_id>/<copil_id>/<block_id>.<ext>`. The policies
-- only allow each user on their OWN prefix (same doctrine as
-- the `copils` RLS: user_id = auth.uid()). Read via a signed URL (1 h) on the front end.
-- To be applied on PRE-PROD (wxbapegyivoolzsckovs) THEN PROD (hcqninmpmzpqjtedyjyj),
-- GO per step, BEFORE deploying the front end that uploads. Idempotent.
--
-- Check after application:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'copil-media';
--   -- expected: 1 row, public = false, 5242880, {image/png,image/jpeg,image/webp}
--   select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'copil_media_%';
--   -- expected: 4 rows

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
