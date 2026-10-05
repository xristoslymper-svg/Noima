-- Restore writable owner-scoped summary cache access after pilot account isolation,
-- then serialize AI summary generation commits by the latest requested context hash.

grant select, insert, update on public.demo_clinical_summary_cache to authenticated;

drop policy if exists pilot_owner_insert on public.demo_clinical_summary_cache;
drop policy if exists pilot_owner_update on public.demo_clinical_summary_cache;

create policy pilot_owner_insert on public.demo_clinical_summary_cache
for insert to authenticated
with check (private.pilot_owns(tester_id));

create policy pilot_owner_update on public.demo_clinical_summary_cache
for update to authenticated
using (private.pilot_owns(tester_id))
with check (private.pilot_owns(tester_id));

create table if not exists private.demo_clinical_summary_requests (
  tester_id uuid not null,
  patient_id uuid not null,
  context_hash text not null,
  requested_at timestamptz not null default now(),
  primary key (tester_id, patient_id)
);

alter table private.demo_clinical_summary_requests enable row level security;
revoke all on table private.demo_clinical_summary_requests from public, anon, authenticated;

create or replace function public.demo_clinical_summary_request(
  p_tester uuid,
  p_patient uuid,
  p_context_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.pilot_assert_owner(p_tester);

  if p_context_hash is null or length(p_context_hash) < 16 then
    raise exception 'invalid_summary_hash' using errcode='22023';
  end if;

  if not exists (
    select 1
    from public.demo_patients p
    where p.tester_id = p_tester
      and p.id = p_patient
  ) then
    raise exception 'patient_not_found' using errcode='P0002';
  end if;

  insert into private.demo_clinical_summary_requests(tester_id, patient_id, context_hash, requested_at)
  values (p_tester, p_patient, p_context_hash, now())
  on conflict (tester_id, patient_id)
  do update set context_hash = excluded.context_hash, requested_at = excluded.requested_at;
end
$$;

create or replace function public.demo_clinical_summary_commit(
  p_tester uuid,
  p_patient uuid,
  p_context_hash text,
  p_findings jsonb,
  p_sources jsonb,
  p_generated_at timestamptz,
  p_model text,
  p_policy_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested_hash text;
begin
  perform private.pilot_assert_owner(p_tester);

  select r.context_hash
    into v_requested_hash
  from private.demo_clinical_summary_requests r
  where r.tester_id = p_tester
    and r.patient_id = p_patient
  for update;

  if v_requested_hash is distinct from p_context_hash then
    return false;
  end if;

  if jsonb_typeof(p_findings) is distinct from 'array'
     or jsonb_typeof(p_sources) is distinct from 'array'
     or p_generated_at is null
     or coalesce(p_model,'') = ''
     or p_policy_version is null then
    raise exception 'invalid_summary_cache_payload' using errcode='22023';
  end if;

  insert into public.demo_clinical_summary_cache(
    tester_id, patient_id, context_hash, findings, sources,
    generated_at, model, policy_version, updated_at
  )
  values (
    p_tester, p_patient, p_context_hash, p_findings, p_sources,
    p_generated_at, p_model, p_policy_version, now()
  )
  on conflict (tester_id, patient_id)
  do update set
    context_hash = excluded.context_hash,
    findings = excluded.findings,
    sources = excluded.sources,
    generated_at = excluded.generated_at,
    model = excluded.model,
    policy_version = excluded.policy_version,
    updated_at = now();

  return true;
end
$$;

revoke all on function public.demo_clinical_summary_request(uuid,uuid,text) from public, anon;
revoke all on function public.demo_clinical_summary_commit(uuid,uuid,text,jsonb,jsonb,timestamptz,text,integer) from public, anon;
grant execute on function public.demo_clinical_summary_request(uuid,uuid,text) to authenticated;
grant execute on function public.demo_clinical_summary_commit(uuid,uuid,text,jsonb,jsonb,timestamptz,text,integer) to authenticated;

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
