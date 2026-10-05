create table if not exists public.demo_clinical_summary_cache (
  tester_id uuid not null,
  patient_id uuid not null,
  context_hash text not null,
  findings jsonb not null check (jsonb_typeof(findings)='array'),
  sources jsonb not null check (jsonb_typeof(sources)='array'),
  generated_at timestamptz not null,
  model text not null,
  policy_version integer not null,
  updated_at timestamptz not null default now(),
  primary key (tester_id, patient_id)
);

alter table public.demo_clinical_summary_cache enable row level security;
revoke all on public.demo_clinical_summary_cache from anon;
grant select, insert, update on public.demo_clinical_summary_cache to authenticated;

create policy pilot_owner_read on public.demo_clinical_summary_cache
for select to authenticated using (private.pilot_owns(tester_id));

create policy pilot_owner_insert on public.demo_clinical_summary_cache
for insert to authenticated with check (private.pilot_owns(tester_id));

create policy pilot_owner_update on public.demo_clinical_summary_cache
for update to authenticated using (private.pilot_owns(tester_id))
with check (private.pilot_owns(tester_id));
