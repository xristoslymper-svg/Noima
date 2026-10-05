-- Finalize summary-cache permissions after pilot ownership helpers exist.
-- This migration is idempotent and reconciles fresh installs with production.

alter table public.demo_clinical_summary_cache enable row level security;
revoke all on public.demo_clinical_summary_cache from public, anon;
grant select, insert, update on public.demo_clinical_summary_cache to authenticated;

drop policy if exists pilot_owner_read on public.demo_clinical_summary_cache;
drop policy if exists pilot_owner_insert on public.demo_clinical_summary_cache;
drop policy if exists pilot_owner_update on public.demo_clinical_summary_cache;

create policy pilot_owner_read on public.demo_clinical_summary_cache
for select to authenticated using (private.pilot_owns(tester_id));

create policy pilot_owner_insert on public.demo_clinical_summary_cache
for insert to authenticated with check (private.pilot_owns(tester_id));

create policy pilot_owner_update on public.demo_clinical_summary_cache
for update to authenticated using (private.pilot_owns(tester_id))
with check (private.pilot_owns(tester_id));

do $$
begin
  if to_regprocedure('private.pilot_impl_demo_apply_due_medication_events(uuid)') is not null then
    execute 'alter function private.pilot_impl_demo_apply_due_medication_events(uuid) set search_path = ''''';
  end if;
  if to_regprocedure('public.demo_med_revision_guard()') is not null then
    execute 'alter function public.demo_med_revision_guard() set search_path = ''''';
  end if;
end
$$;
