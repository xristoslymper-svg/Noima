-- Phase 1: clinical foundation. No patient data or login credentials in migrations.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke create on schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create type public.patient_status as enum ('active', 'inactive');
create type public.session_type as enum ('initial_assessment', 'follow_up');
create type public.session_status as enum ('draft', 'completed');
create type public.section_type as enum ('psychiatric_interview', 'symptoms', 'side_effects', 'medication_adherence', 'mse', 'risk_assessment', 'clinical_assessment', 'treatment_plan', 'next_review');
create type public.content_source as enum ('manual', 'dictation', 'ai_proposal');
create type public.section_status as enum ('draft', 'approved');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null default '', professional_title text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.practices (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) > 0),
  timezone text not null default 'Europe/Athens', is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.practice_members (
  practice_id uuid not null references public.practices(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('owner','clinician')), created_at timestamptz not null default now(),
  primary key (practice_id, user_id)
);
create index practice_members_user_idx on public.practice_members(user_id, practice_id);

-- Non-exposed, narrowly scoped definer helper avoids recursive membership RLS.
create function private.is_practice_member(p_practice_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.practice_members where practice_id = p_practice_id and user_id = auth.uid()
  );
$$;
revoke all on function private.is_practice_member(uuid) from public, anon, authenticated;
grant execute on function private.is_practice_member(uuid) to authenticated;

create table public.patients (
  id uuid primary key default gen_random_uuid(), practice_id uuid not null references public.practices(id),
  first_name text not null check (length(trim(first_name)) > 0), last_name text not null default '',
  date_of_birth date, reported_age integer check (reported_age between 0 and 125), age_reported_at date,
  phone text, email text, status public.patient_status not null default 'active',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id, practice_id), check ((reported_age is null) = (age_reported_at is null))
);
create index patients_practice_name_idx on public.patients(practice_id, last_name, first_name);
create table public.patient_history (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null unique, practice_id uuid not null,
  chief_complaint text, psychiatric_history text, medical_history text, substance_history text,
  family_history text, social_functioning text, protective_factors text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(patient_id, practice_id) references public.patients(id, practice_id)
);
create table public.clinical_sessions (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null, practice_id uuid not null,
  clinician_id uuid not null default auth.uid(), session_type public.session_type not null,
  scheduled_at timestamptz not null, started_at timestamptz, completed_at timestamptz,
  status public.session_status not null default 'draft', version integer not null default 1,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id, patient_id, practice_id),
  foreign key(patient_id, practice_id) references public.patients(id, practice_id),
  foreign key(practice_id, clinician_id) references public.practice_members(practice_id, user_id),
  check ((status = 'completed') = (completed_at is not null)),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);
create index clinical_sessions_patient_date_idx on public.clinical_sessions(patient_id, scheduled_at desc);
create index clinical_sessions_practice_clinician_idx on public.clinical_sessions(practice_id, clinician_id);

-- Raw input is never the official note. No raw audio storage is created.
create table public.clinical_inputs (
  id uuid primary key default gen_random_uuid(), session_id uuid not null, patient_id uuid not null, practice_id uuid not null,
  section_type public.section_type, transcript text not null check (length(trim(transcript)) > 0),
  origin text not null check (origin in ('typed','local_transcript','server_transcript')),
  created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now(),
  unique(id, session_id, patient_id, practice_id),
  foreign key(session_id, patient_id, practice_id) references public.clinical_sessions(id, patient_id, practice_id)
);
create table public.clinical_proposals (
  id uuid primary key default gen_random_uuid(), input_id uuid not null, session_id uuid not null, patient_id uuid not null, practice_id uuid not null,
  section_type public.section_type not null, content text not null check (length(trim(content)) > 0),
  provider text not null, model_version text, created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), unique(id, session_id, patient_id, practice_id, section_type),
  foreign key(input_id, session_id, patient_id, practice_id) references public.clinical_inputs(id, session_id, patient_id, practice_id)
);
create table public.session_sections (
  id uuid primary key default gen_random_uuid(), session_id uuid not null, patient_id uuid not null, practice_id uuid not null,
  section_type public.section_type not null, content text not null check (length(trim(content)) > 0),
  source public.content_source not null default 'manual', status public.section_status not null default 'draft',
  input_id uuid, proposal_id uuid, version integer not null default 1,
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(session_id, section_type),
  foreign key(session_id, patient_id, practice_id) references public.clinical_sessions(id, patient_id, practice_id),
  foreign key(input_id, session_id, patient_id, practice_id) references public.clinical_inputs(id, session_id, patient_id, practice_id),
  foreign key(proposal_id, session_id, patient_id, practice_id, section_type) references public.clinical_proposals(id, session_id, patient_id, practice_id, section_type),
  check (source <> 'ai_proposal' or proposal_id is not null),
  check (source <> 'dictation' or input_id is not null),
  check ((status = 'approved') = (approved_by is not null and approved_at is not null)),
  check (status <> 'draft' or (approved_by is null and approved_at is null))
);
create table public.patient_diagnoses (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null, practice_id uuid not null, session_id uuid,
  diagnosis_text text not null check (length(trim(diagnosis_text)) > 0), diagnosis_code text, diagnosis_system text,
  status text not null default 'active' check (status in ('active','resolved','differential')),
  diagnosed_at timestamptz not null default now(), created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(patient_id, practice_id) references public.patients(id, practice_id),
  foreign key(session_id, patient_id, practice_id) references public.clinical_sessions(id, patient_id, practice_id)
);
create table public.patient_medications (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null, practice_id uuid not null,
  medication_name text not null check (length(trim(medication_name)) > 0),
  dose numeric not null check (dose > 0 and dose <= 100000), unit text not null, frequency text not null, route text,
  effective_from date not null default current_date,
  started_at date not null, ended_at date, status text not null default 'active' check (status in ('active','stopped')),
  notes text, created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id, patient_id, practice_id),
  foreign key(patient_id, practice_id) references public.patients(id, practice_id),
  check (ended_at is null or ended_at >= started_at), check ((status = 'stopped') = (ended_at is not null))
);
create table public.medication_events (
  id uuid primary key default gen_random_uuid(), medication_id uuid not null, patient_id uuid not null, practice_id uuid not null,
  event_type text not null check(event_type in ('started','changed','stopped')),
  previous_state jsonb, new_state jsonb not null, actor_user_id uuid references public.profiles(id),
  occurred_at timestamptz not null default now(), effective_on date not null,
  foreign key(medication_id, patient_id, practice_id) references public.patient_medications(id, patient_id, practice_id)
);
create table public.medication_side_effects (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null, practice_id uuid not null,
  medication_id uuid, session_id uuid, description text not null, severity text, impact text,
  reported_at timestamptz not null default now(), created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key(patient_id, practice_id) references public.patients(id, practice_id),
  foreign key(medication_id, patient_id, practice_id) references public.patient_medications(id, patient_id, practice_id),
  foreign key(session_id, patient_id, practice_id) references public.clinical_sessions(id, patient_id, practice_id)
);
create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null, practice_id uuid not null, session_id uuid not null unique,
  suicidal_ideation boolean, intent boolean, plan boolean, self_harm boolean, attempt_history boolean,
  protective_factors text, clinical_note text, assessed_at timestamptz not null default now(),
  assessed_by uuid not null default auth.uid() references public.profiles(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(session_id, patient_id, practice_id) references public.clinical_sessions(id, patient_id, practice_id)
);

create table public.psychometric_instruments (
  id uuid primary key default gen_random_uuid(), code text not null, name text not null, description text,
  version text not null, active boolean not null default false,
  -- Reviewed instrument definitions are provisioned administratively, never by patients.
  definition jsonb, unique(code, version)
);
create table public.psychometric_assessments (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null, practice_id uuid not null, session_id uuid,
  instrument_id uuid not null references public.psychometric_instruments(id),
  status text not null default 'draft' check(status in ('draft','sent','completed')),
  delivery_method text not null check(delivery_method in ('clinician','patient_link')),
  sent_at timestamptz, completed_at timestamptz, total_score numeric, interpretation text,
  result_source text not null default 'responses' check(result_source in ('responses','historical_total')),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id, patient_id, practice_id),
  foreign key(patient_id, practice_id) references public.patients(id, practice_id),
  foreign key(session_id, patient_id, practice_id) references public.clinical_sessions(id, patient_id, practice_id),
  check ((status = 'completed') = (completed_at is not null)),
  check (status <> 'sent' or sent_at is not null)
);
create table public.psychometric_responses (
  id uuid primary key default gen_random_uuid(), assessment_id uuid not null, patient_id uuid not null, practice_id uuid not null,
  item_key text not null check(length(item_key) > 0), response_value jsonb not null, score numeric,
  created_by uuid references public.profiles(id) default auth.uid(), created_at timestamptz not null default now(),
  unique(assessment_id, item_key),
  foreign key(assessment_id, patient_id, practice_id) references public.psychometric_assessments(id, patient_id, practice_id)
);
create table private.assessment_invitations (
  id uuid primary key default gen_random_uuid(), assessment_id uuid not null, patient_id uuid not null, practice_id uuid not null,
  token_hash bytea not null unique check(octet_length(token_hash) = 32),
  expires_at timestamptz not null, consumed_at timestamptz, revoked_at timestamptz,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  foreign key(assessment_id, patient_id, practice_id) references public.psychometric_assessments(id, patient_id, practice_id),
  check(expires_at > created_at)
);
create table public.appointments (
  id uuid primary key default gen_random_uuid(), practice_id uuid not null, patient_id uuid not null, clinician_id uuid not null,
  session_id uuid unique, scheduled_start timestamptz not null, scheduled_end timestamptz not null,
  appointment_type public.session_type not null,
  status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled','no_show')),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(patient_id, practice_id) references public.patients(id, practice_id),
  foreign key(practice_id, clinician_id) references public.practice_members(practice_id, user_id),
  foreign key(session_id, patient_id, practice_id) references public.clinical_sessions(id, patient_id, practice_id),
  check(scheduled_end > scheduled_start)
);
create index appointments_practice_start_idx on public.appointments(practice_id, scheduled_start);
create index appointments_clinician_idx on public.appointments(clinician_id, scheduled_start);
create table public.patient_summary (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null unique, practice_id uuid not null,
  summary_text text not null, generated_at timestamptz not null default now(), source_version text not null,
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  foreign key(patient_id, practice_id) references public.patients(id, practice_id),
  check ((approved_by is null) = (approved_at is null))
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), practice_id uuid not null references public.practices(id),
  actor_user_id uuid references public.profiles(id), patient_id uuid,
  event_type text not null, entity_type text not null, entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key(patient_id, practice_id) references public.patients(id, practice_id)
);
create index audit_events_practice_date_idx on public.audit_events(practice_id, created_at desc);

-- Explicit table grants, with tenant isolation and authenticated actor attribution.
do $$ declare t text; begin
  foreach t in array array['profiles','practices','practice_members','patients','patient_history','clinical_sessions',
    'clinical_inputs','clinical_proposals','session_sections','patient_diagnoses','patient_medications','medication_events',
    'medication_side_effects','risk_assessments','psychometric_instruments','psychometric_assessments',
    'psychometric_responses','appointments','patient_summary','audit_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  foreach t in array array['patients','patient_history','clinical_sessions','clinical_inputs','clinical_proposals','session_sections',
    'patient_diagnoses','patient_medications','medication_events','medication_side_effects','risk_assessments',
    'psychometric_assessments','psychometric_responses','appointments','patient_summary','audit_events'] loop
    execute format('create policy tenant_read on public.%I for select to authenticated using (private.is_practice_member(practice_id))', t);
    if t <> 'patients' then
      execute format('create index %I on public.%I(practice_id, patient_id)', t || '_tenant_idx', t);
    end if;
  end loop;
  foreach t in array array['patients','patient_history','clinical_sessions','clinical_inputs','clinical_proposals','session_sections',
    'patient_diagnoses','patient_medications','medication_side_effects','risk_assessments','psychometric_assessments','psychometric_responses','appointments'] loop
    execute format('grant insert on public.%I to authenticated', t);
    execute format('create policy tenant_insert on public.%I for insert to authenticated with check (private.is_practice_member(practice_id) and created_by = (select auth.uid()))', t);
  end loop;
  foreach t in array array['patients','patient_history','clinical_sessions','session_sections','patient_diagnoses',
    'patient_medications','risk_assessments','psychometric_assessments','appointments'] loop
    execute format('create policy tenant_update on public.%I for update to authenticated using (private.is_practice_member(practice_id)) with check (private.is_practice_member(practice_id))', t);
  end loop;
end $$;
alter table private.assessment_invitations enable row level security;
revoke all on private.assessment_invitations from public, anon, authenticated;
-- No policy or API grants: access only through future narrow token RPCs.
create policy own_profile on public.profiles for select to authenticated using(id = (select auth.uid()));
create policy edit_own_profile on public.profiles for update to authenticated using(id = (select auth.uid())) with check(id = (select auth.uid()));
grant update(full_name, professional_title) on public.profiles to authenticated;
create policy member_practice on public.practices for select to authenticated using(private.is_practice_member(id));
create policy member_roster on public.practice_members for select to authenticated using(private.is_practice_member(practice_id));
create policy instruments_read on public.psychometric_instruments for select to authenticated using(true);

-- No clinical DELETE grants. Status/approval transitions are exclusively RPC-controlled.
grant update(first_name,last_name,date_of_birth,reported_age,age_reported_at,phone,email,status) on public.patients to authenticated;
grant update(chief_complaint,psychiatric_history,medical_history,substance_history,family_history,social_functioning,protective_factors) on public.patient_history to authenticated;
grant update(scheduled_at,started_at) on public.clinical_sessions to authenticated;
grant update(content,source,input_id,proposal_id) on public.session_sections to authenticated;
grant update(diagnosis_text,diagnosis_code,diagnosis_system,status,diagnosed_at) on public.patient_diagnoses to authenticated;
grant update(dose,unit,frequency,route,ended_at,status,notes,effective_from) on public.patient_medications to authenticated;
grant update(suicidal_ideation,intent,plan,self_harm,attempt_history,protective_factors,clinical_note,assessed_at) on public.risk_assessments to authenticated;
grant update(scheduled_start,scheduled_end,status) on public.appointments to authenticated;

create function private.guard_record() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if new.id <> old.id or new.created_at <> old.created_at then raise exception 'Record identity is immutable'; end if;
    if to_jsonb(new)->'practice_id' is distinct from to_jsonb(old)->'practice_id'
      or to_jsonb(new)->'patient_id' is distinct from to_jsonb(old)->'patient_id'
      or to_jsonb(new)->'session_id' is distinct from to_jsonb(old)->'session_id'
      or to_jsonb(new)->'created_by' is distinct from to_jsonb(old)->'created_by' then
      raise exception 'Record ownership is immutable';
    end if;
    if to_jsonb(new) ? 'updated_at' then new.updated_at := now(); end if;
  end if;
  return new;
end $$;
create function private.guard_session() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if old.status = 'completed' then raise exception 'Completed session is immutable'; end if;
    if new.clinician_id <> old.clinician_id or new.session_type <> old.session_type then raise exception 'Session ownership is immutable'; end if;
    new.version := old.version + 1;
  elsif new.status <> 'draft' or new.version <> 1 then raise exception 'Create a draft session first';
  end if;
  if auth.uid() is not null and new.clinician_id <> auth.uid() then raise exception 'Only the session clinician may write'; end if;
  return new;
end $$;
create function private.guard_session_child() returns trigger language plpgsql set search_path = '' as $$
declare s public.clinical_sessions;
begin
  if new.session_id is not null then
    select * into s from public.clinical_sessions where id = new.session_id for update;
    if not found or s.status <> 'draft' then raise exception 'Session is unavailable or completed'; end if;
    if auth.uid() is not null and s.clinician_id <> auth.uid() then raise exception 'Only the session clinician may write'; end if;
  end if;
  if TG_TABLE_NAME = 'risk_assessments' and auth.uid() is not null then new.assessed_by := auth.uid(); end if;
  return new;
end $$;
create function private.guard_section() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if new.status <> 'draft' or new.version <> 1 then raise exception 'Create a draft section first'; end if;
  else
    if old.status = 'approved' then raise exception 'Approved section is immutable'; end if;
    if new.section_type <> old.section_type then raise exception 'Section type is immutable'; end if;
    new.version := old.version + 1;
  end if;
  return new;
end $$;
create function private.guard_assessment() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and old.status = 'completed' then raise exception 'Completed assessment is immutable'; end if;
  if TG_OP = 'INSERT' and new.status <> 'draft' then raise exception 'Create a draft assessment first'; end if;
  return new;
end $$;
create function private.guard_response() returns trigger language plpgsql set search_path = '' as $$
declare st text;
begin
  select status into st from public.psychometric_assessments where id = new.assessment_id for update;
  if st is null or st = 'completed' then raise exception 'Assessment is unavailable or completed'; end if;
  return new;
end $$;

-- These triggers operate under the caller's RLS. Parent locks serialize edits and completion.
do $$ declare t text; begin
  foreach t in array array['profiles','patients','patient_history','clinical_sessions','session_sections','patient_diagnoses',
    'patient_medications','risk_assessments','psychometric_assessments','appointments'] loop
    execute format('create trigger record_guard before update on public.%I for each row execute function private.guard_record()', t);
  end loop;
  foreach t in array array['clinical_inputs','clinical_proposals','session_sections','patient_diagnoses','medication_side_effects','risk_assessments'] loop
    execute format('create trigger a_session_guard before insert or update on public.%I for each row execute function private.guard_session_child()', t);
  end loop;
end $$;
create trigger session_guard before insert or update on public.clinical_sessions for each row execute function private.guard_session();
create trigger section_guard before insert or update on public.session_sections for each row execute function private.guard_section();
create trigger assessment_guard before insert or update on public.psychometric_assessments for each row execute function private.guard_assessment();
create trigger response_guard before insert or update on public.psychometric_responses for each row execute function private.guard_response();

-- Automatically capture medication history; never put full clinical content in audit metadata.
create function private.capture_medication_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.medication_events(medication_id,patient_id,practice_id,event_type,previous_state,new_state,actor_user_id,effective_on)
  values(new.id,new.patient_id,new.practice_id,
    case when TG_OP = 'INSERT' then 'started' when new.status = 'stopped' then 'stopped' else 'changed' end,
    case when TG_OP = 'UPDATE' then jsonb_build_object('dose',old.dose,'unit',old.unit,'frequency',old.frequency,'route',old.route,'status',old.status,'ended_at',old.ended_at,'notes',old.notes) end,
    jsonb_build_object('dose',new.dose,'unit',new.unit,'frequency',new.frequency,'route',new.route,'status',new.status,'ended_at',new.ended_at,'notes',new.notes),auth.uid(),new.effective_from);
  return new;
end $$;
create trigger medication_history after insert or update on public.patient_medications for each row execute function private.capture_medication_event();
create function private.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare ev text; pid uuid;
begin
  pid := case when TG_TABLE_NAME = 'patients' then new.id else (to_jsonb(new)->>'patient_id')::uuid end;
  ev := case TG_TABLE_NAME
    when 'patients' then case when TG_OP = 'INSERT' then 'patient_created' else 'patient_updated' end
    when 'clinical_sessions' then case when TG_OP = 'INSERT' then 'session_created' when to_jsonb(new)->>'status' = 'completed' then 'session_completed' else 'session_updated' end
    when 'session_sections' then case when to_jsonb(new)->>'status' = 'approved' then 'clinical_section_approved' else 'clinical_section_drafted' end
    when 'patient_medications' then case when TG_OP = 'INSERT' then 'medication_created' else 'medication_changed' end
    when 'patient_diagnoses' then case when TG_OP = 'INSERT' then 'diagnosis_created' else 'diagnosis_updated' end
    when 'psychometric_assessments' then case to_jsonb(new)->>'status' when 'sent' then 'psychometric_sent' when 'completed' then 'psychometric_completed' else 'psychometric_created' end
    else TG_TABLE_NAME || case when TG_OP = 'INSERT' then '_created' else '_updated' end end;
  insert into public.audit_events(practice_id,actor_user_id,patient_id,event_type,entity_type,entity_id)
  values(new.practice_id,auth.uid(),pid,ev,TG_TABLE_NAME,new.id);
  -- Invalidate derived summary when underlying clinical facts change.
  delete from public.patient_summary where patient_id = pid;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['patients','patient_history','clinical_sessions','session_sections','patient_medications',
    'patient_diagnoses','medication_side_effects','risk_assessments','psychometric_assessments','appointments'] loop
    execute format('create trigger audit_change after insert or update on public.%I for each row execute function private.audit_change()', t);
  end loop;
end $$;

-- Only this explicit, version-checked operation approves a draft; AI never calls it automatically.
create function private.approve_section(p_id uuid, p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare sec public.session_sections; s public.clinical_sessions;
begin
  select cs.* into s from public.clinical_sessions cs join public.session_sections ss on ss.session_id = cs.id where ss.id = p_id for update of cs;
  if auth.uid() is null or s.id is null or not private.is_practice_member(s.practice_id) or s.clinician_id <> auth.uid() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into sec from public.session_sections where id = p_id for update;
  if s.status <> 'draft' or sec.status <> 'draft' or sec.version <> p_version then raise exception 'Stale or finalized section'; end if;
  update public.session_sections set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
end $$;
create function public.approve_clinical_section(section_id uuid, expected_version integer) returns void
language sql security invoker set search_path = '' as $$ select private.approve_section(section_id, expected_version); $$;

create function private.complete_session(p_id uuid, p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.clinical_sessions;
begin
  select * into s from public.clinical_sessions where id = p_id for update;
  if auth.uid() is null or s.id is null or not private.is_practice_member(s.practice_id) or s.clinician_id <> auth.uid() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if s.status <> 'draft' or s.version <> p_version then raise exception 'Stale or completed session'; end if;
  if exists(select 1 from public.session_sections where session_id = p_id and status <> 'approved') then raise exception 'Review all draft sections first'; end if;
  if exists(select 1 from unnest(array['psychiatric_interview','mse','risk_assessment','clinical_assessment','treatment_plan','next_review']) required(section)
    where not exists(select 1 from public.session_sections where session_id = p_id and section_type::text = required.section and status = 'approved')) then
    raise exception 'Required approved sections are missing';
  end if;
  if not exists(select 1 from public.risk_assessments where session_id = p_id) then raise exception 'Structured risk assessment is required'; end if;
  update public.clinical_sessions set status = 'completed', completed_at = now() where id = p_id;
  update public.appointments set status = 'completed' where session_id = p_id and status = 'scheduled';
  -- Audit and cache invalidation happen in the same transaction via triggers.
end $$;
create function public.complete_clinical_session(session_id uuid, expected_version integer) returns void
language sql security invoker set search_path = '' as $$ select private.complete_session(session_id, expected_version); $$;

-- Deny default PUBLIC function execution, including all trigger routines.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_practice_member(uuid), private.approve_section(uuid,integer), private.complete_session(uuid,integer) to authenticated;
revoke all on function public.approve_clinical_section(uuid,integer), public.complete_clinical_session(uuid,integer) from public, anon, authenticated;
grant execute on function public.approve_clinical_section(uuid,integer), public.complete_clinical_session(uuid,integer) to authenticated;

-- Index referencing columns not already covered by an index prefix.
do $$ declare r record; cols text; begin
  for r in select conrelid, conname, conkey from pg_constraint where contype = 'f'
    and connamespace in ('public'::regnamespace,'private'::regnamespace) loop
    if not exists(select 1 from pg_index where indrelid = r.conrelid and array(select unnest(indkey) limit cardinality(r.conkey)) = r.conkey) then
      select string_agg(quote_ident(attname),',' order by ord) into cols
      from unnest(r.conkey) with ordinality k(attnum,ord) join pg_attribute a on a.attrelid = r.conrelid and a.attnum = k.attnum;
      execute format('create index %I on %s (%s)', left(r.conname,55) || '_idx', r.conrelid::regclass, cols);
    end if;
  end loop;
end $$;

comment on table private.assessment_invitations is 'SHA-256 hashes only. Phase 6 implements bounded token redemption, response validation, expiry, rate limiting and atomic consumption. No anonymous grants.';
comment on table public.patient_summary is 'Derived cache only. Underlying approved clinical records remain authoritative.';
