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
revoke all on public.demo_clinical_summary_cache from public, anon, authenticated;

-- Ownership policies are installed after private.pilot_owns(uuid) exists.
-- Keeping this migration dependency-free makes fresh database replays valid.
