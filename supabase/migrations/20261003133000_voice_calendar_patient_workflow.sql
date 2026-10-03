-- Voice-calendar integrity: atomic new-patient scheduling and protection of started sessions.
create or replace function public.demo_calendar_apply_v2(
  p_tester uuid,
  p_action text,
  p_event_id uuid default null,
  p_patient_id uuid default null,
  p_patient_name text default null,
  p_scheduled_start timestamptz default null,
  p_scheduled_end timestamptz default null,
  p_appointment_type text default 'follow_up',
  p_detail text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_before public.demo_calendar_events%rowtype;
  v_after public.demo_calendar_events%rowtype;
  v_patient public.demo_patients%rowtype;
  v_conflict boolean;
begin
  if p_tester is null then raise exception 'tester_required'; end if;
  if p_action not in ('move','cancel','create','schedule_follow_up') then raise exception 'unsupported_action'; end if;

  if p_action in ('move','cancel') then
    select * into v_before
    from public.demo_calendar_events
    where id=p_event_id and tester_id=p_tester and status='scheduled'
    for update;
    if not found then raise exception 'event_not_found'; end if;
    if v_before.session_id is not null then raise exception 'session_already_started'; end if;
  end if;

  if p_action='cancel' then
    update public.demo_calendar_events
    set status='cancelled',session_id=null,updated_at=now()
    where id=p_event_id and tester_id=p_tester
    returning * into v_after;
  elsif p_action='move' then
    if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end<=p_scheduled_start then raise exception 'valid_start_end_required'; end if;
    if p_scheduled_start<=now() then raise exception 'past_appointment'; end if;
    select exists(
      select 1 from public.demo_calendar_events e
      where e.tester_id=p_tester and e.status='scheduled' and e.id<>p_event_id
        and e.scheduled_start<p_scheduled_end and e.scheduled_end>p_scheduled_start
    ) into v_conflict;
    if v_conflict then raise exception 'calendar_conflict'; end if;
    update public.demo_calendar_events
    set scheduled_start=p_scheduled_start,scheduled_end=p_scheduled_end,updated_at=now()
    where id=p_event_id and tester_id=p_tester
    returning * into v_after;
  else
    if p_patient_id is null then raise exception 'patient_required'; end if;
    select * into v_patient from public.demo_patients where id=p_patient_id and tester_id=p_tester;
    if not found then raise exception 'patient_not_found'; end if;
    if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end<=p_scheduled_start then raise exception 'valid_start_end_required'; end if;
    if p_scheduled_start<=now() then raise exception 'past_appointment'; end if;
    select exists(
      select 1 from public.demo_calendar_events e
      where e.tester_id=p_tester and e.status='scheduled'
        and e.scheduled_start<p_scheduled_end and e.scheduled_end>p_scheduled_start
    ) into v_conflict;
    if v_conflict then raise exception 'calendar_conflict'; end if;
    insert into public.demo_calendar_events(
      tester_id,patient_id,patient_name,appointment_type,detail,
      scheduled_start,scheduled_end,readiness,readiness_label,status
    )
    values(
      p_tester,v_patient.id,trim(v_patient.first_name||' '||v_patient.last_name),
      case when p_action='schedule_follow_up' then 'follow_up' else coalesce(nullif(p_appointment_type,''),'follow_up') end,
      coalesce(p_detail,''),p_scheduled_start,p_scheduled_end,'ready','Έτοιμη','scheduled'
    )
    returning * into v_after;
  end if;

  insert into public.demo_calendar_audit(action,event_id,before_state,after_state)
  values(
    p_action,
    v_after.id,
    case when p_action in ('move','cancel') then to_jsonb(v_before) else null end,
    to_jsonb(v_after)
  );
  return to_jsonb(v_after);
end $$;

create or replace function public.demo_calendar_create_patient_appointment(
  p_tester uuid,
  p_first_name text,
  p_last_name text default '',
  p_scheduled_start timestamptz default null,
  p_scheduled_end timestamptz default null,
  p_appointment_type text default 'initial_assessment'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_patient public.demo_patients%rowtype;
  v_event public.demo_calendar_events%rowtype;
  v_conflict boolean;
begin
  if p_tester is null or length(trim(coalesce(p_first_name,'')))<1 then raise exception 'invalid_patient'; end if;
  if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end<=p_scheduled_start then raise exception 'valid_start_end_required'; end if;
  if p_scheduled_start<=now() then raise exception 'past_appointment'; end if;

  select exists(
    select 1 from public.demo_calendar_events e
    where e.tester_id=p_tester and e.status='scheduled'
      and e.scheduled_start<p_scheduled_end and e.scheduled_end>p_scheduled_start
  ) into v_conflict;
  if v_conflict then raise exception 'calendar_conflict'; end if;

  insert into public.demo_patients(
    tester_id,first_name,last_name,reported_age,phone,email,note,chief_complaint
  )
  values(
    p_tester,trim(p_first_name),trim(coalesce(p_last_name,'')),null,'','','',''
  )
  returning * into v_patient;

  insert into public.demo_patient_history(patient_id,tester_id)
  values(v_patient.id,p_tester);

  insert into public.demo_calendar_events(
    tester_id,patient_id,patient_name,appointment_type,detail,
    scheduled_start,scheduled_end,readiness,readiness_label,status
  )
  values(
    p_tester,v_patient.id,trim(v_patient.first_name||' '||v_patient.last_name),
    coalesce(nullif(p_appointment_type,''),'initial_assessment'),'',
    p_scheduled_start,p_scheduled_end,'new','Νέος ασθενής','scheduled'
  )
  returning * into v_event;

  insert into public.demo_calendar_audit(action,event_id,before_state,after_state)
  values('create',v_event.id,null,to_jsonb(v_event));

  return jsonb_build_object('patient',to_jsonb(v_patient),'event',to_jsonb(v_event));
end $$;

revoke all on function public.demo_calendar_create_patient_appointment(uuid,text,text,timestamptz,timestamptz,text) from public;
grant execute on function public.demo_calendar_create_patient_appointment(uuid,text,text,timestamptz,timestamptz,text) to anon,authenticated;
