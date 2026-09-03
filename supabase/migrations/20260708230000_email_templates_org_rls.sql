-- CR-C/CR-D (contrat gating 8 juillet 2026) : email_templates org-scopee.
-- V1 (SQL preprod 8/07) : RLS enabled, policies insert/update/delete presentes,
-- AUCUNE policy SELECT -> tout SELECT authenticated retournait 0 ligne, y compris
-- pour le createur. La feature templates custom etait morte de bout en bout.
-- Matrice §2 : lecture org entiere ; creation member+ (viewer exclu) ;
-- update/delete createur OU owner/admin. Pattern get_my_org_id (E14-safe).
-- Appliquee PREPROD le 8/07. PROD : avant merge main (piege 22).

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
