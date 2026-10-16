-- Versioned, clinician-authored retrospective course; no fabricated encounters.
create table private.demo_patient_prior_course_versions (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 tester_id uuid not null,
 patient_id uuid not null references public.demo_patients(id),
 version integer not null check (version>0),
 period_label text not null default '' check (length(period_label)<=120),
 content text not null check (length(trim(content)) between 15 and 12000),
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(tester_id,patient_id,version)
);
create index patient_prior_course_lookup on private.demo_patient_prior_course_versions(tester_id,patient_id,version desc);
alter table private.demo_patient_prior_course_versions enable row level security;
revoke all on private.demo_patient_prior_course_versions from public,anon,authenticated;
create policy prior_course_owner on private.demo_patient_prior_course_versions to authenticated
 using (private.pilot_owns(tester_id)) with check(private.pilot_owns(tester_id));
create function private.demo_prior_course_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'prior_course_immutable'; end $$;
create trigger prior_course_immutable before update or delete on private.demo_patient_prior_course_versions
 for each row execute function private.demo_prior_course_immutable();
revoke all on function private.demo_pr¶»§q«^