-- CR-C/CR-D (gating contract 8 July 2026): email_templates scoped to the org.
-- V1 (pre-prod SQL 8/07): RLS enabled, insert/update/delete policies present,
-- NO SELECT policy at all -> every authenticated SELECT returned 0 rows, including
-- for the creator. The custom-templates feature was dead end to end.
-- Matrix §2: read across the whole org; create member+ (viewer excluded);
-- update/delete creator OR owner/admin. get_my_org_id pattern (E14-safe).
-- Applied on PRE-PROD on 8/07. PROD: before merging main (pitfall 22).

alter table public.email_templates add column if not exists organization_id uuid;

update public.email_templates t
   set organization_id = p.organization_id
  from public.profiles p
 where t.created_by = p.id and t.organization_id is null;

drop policy if exists email_templates_select on public.email_templates;
drop policy if exists email_templates_insert on public.email_templates;
drop policy if exists email_templates_update on public.email_templates;
drop policy if exists email_templates_delete on public.email_templates;

create policy email_templates_select on public.email_templates for select using (
  (organization_id is not null and organization_id = public.get_my_org_id())
  or (organization_id is null and created_by = auth.uid())
);

create policy email_templates_insert on public.email_templates for insert with check (
  created_by = auth.uid()
  and organization_id is not distinct from public.get_my_org_id()
  and coalesce((select org_role from public.profiles where id = auth.uid()), 'member') <> 'viewer'
);

create policy email_templates_update on public.email_templates for update using (
  created_by = auth.uid()
  or (organization_id is not null and organization_id = public.get_my_org_id()
      and (select org_role from public.profiles where id = auth.uid()) in ('owner','admin'))
);

create policy email_templates_delete on public.email_templates for delete using (
  created_by = auth.uid()
  or (organization_id is not null and organization_id = public.get_my_org_id()
      and (select org_role from public.profiles where id = auth.uid()) in ('owner','admin'))
);
