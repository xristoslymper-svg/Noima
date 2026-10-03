-- Pilot friction/readiness: editable patient demographics and conditional risk completion.
create or replace function public.demo_patient_update(
  p_tester uuid,
  p_patient uuid,
  p_first_name text,
  p_last_name text,
  p_age integer,
  p_phone text,
  p_email text,
  p_complaint text,
  p_expected_updated_at timestamptz default null
)
returns public.demo_patients
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.demo_patients;
begin
  select * into p
  from public.demo_patients
  where id=p_patient and tester_id=p_tester
  for update;

  if p.id is null then raise exception 'patient_not_found'; end if;
  if p_expected_updated_at is null or p.updated_at is distinct from p_expected_updated_at then raise exception 'stale_patient'; end if;
  if length(trim(coalesce(p_first_name,'')))<1 then raise exception 'invalid_patient'; end if;
  if p_age is not null and (p_age<0 or p_age>120) then raise exception 'invalid_patient'; end if;

  update public.demo_patients
  set first_name=trim(p_first_name),
      last_name=trim(coalesce(p_last_name,'')),
      reported_age=p_age,
      phone=trim(coalesce(p_phone,'')),
      email=trim(coalesce(p_email,'')),
      chief_complaint=trim(coalesce(p_complaint,'')),
      updated_at=clock_timestamp()
  where id=p_patient and tester_id=p_tester
  returning * into p;

  update public.demo_calendar_events
  set patient_name=trim(p.first_name||' '||p.last_name),updated_at=clock_timestamp()
  where tester_id=p_tester and patient_id=p_patient;

  return p;
end $$;

revoke all on function public.demo_patient_update(uuid,uuid,text,text,integer,text,text,text,timestamptz) from public;
grant execute on function public.demo_patient_update(uuid,uuid,text,text,integer,text,text,text,timestamptz) to anon,authenticated;

create or replace function public.demo_session_finalize(
  p_tester uuid,
  p_session uuid,
  p_expected_version integer
)
returns public.demo_sessions
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.demo_sessions;
  missing text;
  risk public.demo_risk_assessments;
begin
  select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
  if s.id is null then raise exception 'session_unavailable'; end if;
  if s.status='completed' then return s; end if;
  if p_expected_version is null or s.version<>p_expected_version then raise exception 'stale_session'; end if;

  select string_agg(u.section,', ') into missing
  from unnest(array['interview','mse','assessment','plan','review']) as u(section)
  where not exists(
    select 1 from public.demo_session_sections
    where session_id=p_session and section_key=u.section and length(trim(content))>0
  );
  if missing is not null then raise exception 'missing_sections:%',missing; end if;

  select * into risk from public.demo_risk_assessments where session_id=p_session;
  if risk.session_id is null or risk.suicidal_ideation='not_assessed' then raise exception 'risk_required'; end if;
  if risk.suicidal_ideation='positive'
     and (
       risk.intent='not_assessed'
       or risk.plan='not_assessed'
       or risk.self_harm='not_assessed'
       or risk.attempt_history='not_assessed'
     )
  then
    raise exception 'risk_followup_required';
  end if;

  update public.demo_sessions
  set status='completed',completed_at=now(),version=version+1,updated_at=now()
  where id=p_session
  returning * into s;

  update public.demo_calendar_events
  set status='completed',updated_at=now()
  where tester_id=p_tester and session_id=p_session and status='scheduled';

  return s;
end $$;
