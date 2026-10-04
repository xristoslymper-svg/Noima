create or replace function public.demo_calendar_apply_v2(p_tester uuid,p_action text,p_event_id uuid default null,p_patient_id uuid default null,p_patient_name text default null,p_scheduled_start timestamptz default null,p_scheduled_end timestamptz default null,p_appointment_type text default 'follow_up',p_detail text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_before public.demo_calendar_events%rowtype; v_after public.demo_calendar_events%rowtype; v_patient public.demo_patients%rowtype; v_conflict boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_tester::text, 721));
 if p_tester is null then raise exception 'tester_required'; end if;
 if p_action not in ('move','cancel','create','schedule_follow_up') then raise exception 'unsupported_action'; end if;
 if p_action in ('move','cancel') then
   select * into v_before from public.demo_calendar_events where id=p_event_id and tester_id=p_tester and status='scheduled' for update;
   if not found then raise exception 'event_not_found'; end if;
   if v_before.session_id is not null then raise exception 'session_already_started'; end if;
 end if;
 if p_action='cancel' then
  update public.demo_calendar_events set status='cancelled',updated_at=now() where id=p_event_id and tester_id=p_tester returning * into v_after;
 elsif p_action='move' then
  if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end<=p_scheduled_start then raise exception 'valid_start_end_required'; end if;
  if p_scheduled_start < now() then raise exception 'past_appointment'; end if;
  select exists(select 1 from public.demo_calendar_events e where e.tester_id=p_tester and e.status='scheduled' and e.id<>p_event_id and e.scheduled_start<p_scheduled_end and e.scheduled_end>p_scheduled_start) into v_conflict;
  if v_conflict then raise exception 'calendar_conflict'; end if;
  update public.demo_calendar_events set scheduled_start=p_scheduled_start,scheduled_end=p_scheduled_end,updated_at=now() where id=p_event_id and tester_id=p_tester returning * into v_after;
 else
  if p_patient_id is null then raise exception 'patient_required'; end if;
  select * into v_patient from public.demo_patients where id=p_patient_id and tester_id=p_tester; if not found then raise exception 'patient_not_found'; end if;
  if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end<=p_scheduled_start then raise exception 'valid_start_end_required'; end if;
  if p_scheduled_start < now() then raise exception 'past_appointment'; end if;
  select exists(select 1 from public.demo_calendar_events e where e.tester_id=p_tester and e.status='scheduled' and e.scheduled_start<p_scheduled_end and e.scheduled_end>p_scheduled_start) into v_conflict;
  if v_conflict then raise exception 'calendar_conflict'; end if;
  insert into public.demo_calendar_events(tester_id,patient_id,patient_name,appointment_type,detail,scheduled_start,scheduled_end,readiness,readiness_label,status)
  values(p_tester,v_patient.id,trim(v_patient.first_name||' '||v_patient.last_name),case when p_action='schedule_follow_up' then 'follow_up' else coalesce(nullif(p_appointment_type,''),'follow_up') end,coalesce(p_detail,''),p_scheduled_start,p_scheduled_end,'ready','Έτοιμη','scheduled') returning * into v_after;
 end if;
 insert into public.demo_calendar_audit(action,event_id,before_state,after_state) values(p_action,v_after.id,case when p_action in ('move','cancel') then to_jsonb(v_before) else null end,to_jsonb(v_after));
 return to_jsonb(v_after);
end $$;

create or replace function public.demo_calendar_create_recurring(
 p_tester uuid,p_patient_id uuid,p_scheduled_start timestamptz,p_scheduled_end timestamptz,
 p_appointment_type text,p_interval_weeks integer,p_occurrences integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_patient public.demo_patients%rowtype; v_series uuid:=gen_random_uuid(); i integer; s timestamptz; e timestamptz; v_conflict boolean; created jsonb:='[]'::jsonb; row_event public.demo_calendar_events%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_tester::text, 721));
 if p_interval_weeks is null or p_occurrences is null or p_interval_weeks not in (1,2,4) or p_occurrences < 2 or p_occurrences > 52 then raise exception 'invalid_recurrence'; end if;
 select * into v_patient from public.demo_patients where id=p_patient_id and tester_id=p_tester; if not found then raise exception 'patient_not_found'; end if;
 if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_start < now() or p_scheduled_end<=p_scheduled_start then raise exception 'past_appointment'; end if;
 if p_scheduled_end-p_scheduled_start > interval '24 hours' then raise exception 'valid_start_end_required'; end if;
 -- Validate the complete series first: all-or-nothing.
 for i in 0..p_occurrences-1 loop
   s:=((p_scheduled_start at time zone 'Europe/Athens')+(i*p_interval_weeks||' weeks')::interval) at time zone 'Europe/Athens'; e:=s+(p_scheduled_end-p_scheduled_start);
   if (s at time zone 'Europe/Athens')<>(p_scheduled_start at time zone 'Europe/Athens')+(i*p_interval_weeks||' weeks')::interval or ((s-interval '1 hour') at time zone 'Europe/Athens')=(s at time zone 'Europe/Athens') or ((s+interval '1 hour') at time zone 'Europe/Athens')=(s at time zone 'Europe/Athens') then raise exception 'invalid_local_time:%',to_char(s at time zone 'Europe/Athens','DD/MM/YYYY HH24:MI'); end if;
   select exists(select 1 from public.demo_calendar_events x where x.tester_id=p_tester and x.status='scheduled' and x.scheduled_start<e and x.scheduled_end>s) into v_conflict;
   if v_conflict then raise exception 'calendar_conflict:%', to_char(s at time zone 'Europe/Athens','DD/MM/YYYY HH24:MI'); end if;
 end loop;
 for i in 0..p_occurrences-1 loop
   s:=((p_scheduled_start at time zone 'Europe/Athens')+(i*p_interval_weeks||' weeks')::interval) at time zone 'Europe/Athens'; e:=s+(p_scheduled_end-p_scheduled_start);
   insert into public.demo_calendar_events(tester_id,patient_id,patient_name,appointment_type,detail,scheduled_start,scheduled_end,readiness,readiness_label,status,series_id,recurrence_interval_weeks)
   values(p_tester,v_patient.id,trim(v_patient.first_name||' '||v_patient.last_name),coalesce(nullif(p_appointment_type,''),'follow_up'),'',s,e,'ready','Έτοιμη','scheduled',v_series,p_interval_weeks)
   returning * into row_event;
   insert into public.demo_calendar_audit(action,event_id,before_state,after_state) values('create_recurring',row_event.id,null,to_jsonb(row_event));
   created:=created||jsonb_build_array(to_jsonb(row_event));
 end loop;
 return jsonb_build_object('series_id',v_series,'events',created);
end $$;

grant execute on function public.demo_calendar_create_recurring(uuid,uuid,timestamptz,timestamptz,text,integer,integer) to anon,authenticated;

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
  perform pg_advisory_xact_lock(hashtextextended(p_tester::text, 721));
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

create or replace function public.demo_calendar_start_session(p_tester uuid,p_event uuid)
returns public.demo_sessions language plpgsql security definer set search_path=public as $$
declare e public.demo_calendar_events; s public.demo_sessions; st text;
begin
 select * into e from public.demo_calendar_events where id=p_event and tester_id=p_tester and status='scheduled' for update;
 if not found or e.patient_id is null then raise exception 'appointment_unavailable'; end if;
 if e.session_id is not null then
  select * into s from public.demo_sessions where id=e.session_id and tester_id=p_tester;
  if found then
   if s.patient_id<>e.patient_id then raise exception 'calendar_session_patient_mismatch'; end if;
   if s.status='completed' then update public.demo_calendar_events set status='completed',updated_at=now() where id=e.id; end if;
   return s;
  end if;
 end if;
 select * into s from public.demo_sessions where patient_id=e.patient_id and tester_id=p_tester and status='draft' and session_type=case when e.appointment_type='initial_assessment' then 'initial_assessment' else 'follow_up' end order by created_at desc limit 1;
 if s.id is not null and exists(select 1 from public.demo_calendar_events other where other.session_id=s.id and other.id<>e.id) then
  raise exception 'draft_linked_elsewhere';
 end if;
 if s.id is null then
  st:=case when e.appointment_type='initial_assessment' then 'initial_assessment' else 'follow_up' end;
  insert into public.demo_sessions(tester_id,patient_id,session_type) values(p_tester,e.patient_id,st) returning * into s;
 end if;
 update public.demo_calendar_events set session_id=s.id,updated_at=now() where id=e.id;
 return s;
end $$;


-- All public calendar writers serialize per fictional workspace before conflict checks.
-- Browser edits additionally require the exact version they displayed.
create or replace function public.demo_calendar_edit(
 p_tester uuid,p_action text,p_event uuid,p_expected_updated_at timestamptz,
 p_start timestamptz default null,p_end timestamptz default null,p_scope text default 'one',
 p_expected_series_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare anchor public.demo_calendar_events; item public.demo_calendar_events; ids uuid[];
 candidate_start timestamptz; candidate_end timestamptz; day_delta integer; local_time time; result public.demo_calendar_events; before_state jsonb;
begin
 if p_tester is null or p_action not in ('move','cancel','restore') or p_scope not in ('one','future','series') then raise exception 'invalid_calendar_edit'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tester::text,721));
 select * into anchor from public.demo_calendar_events where id=p_event and tester_id=p_tester for update;
 if not found then raise exception 'event_not_found'; end if;
 if p_expected_updated_at is null or anchor.updated_at<>p_expected_updated_at then raise exception 'stale_calendar'; end if;
 if anchor.session_id is not null then raise exception 'session_already_started'; end if;
 if anchor.status<>(case when p_action='restore' then 'cancelled' else 'scheduled' end) then raise exception 'event_not_found'; end if;
 if p_scope<>'one' and anchor.series_id is null then raise exception 'invalid_calendar_edit'; end if;
 if p_scope<>'one' and (p_expected_series_updated_at is null or p_expected_series_updated_at<>(select max(updated_at) from public.demo_calendar_events where tester_id=p_tester and series_id=anchor.series_id)) then raise exception 'stale_calendar'; end if;
 select array_agg(id order by id) into ids from public.demo_calendar_events
 where tester_id=p_tester and status=anchor.status and
 (id=anchor.id or (p_scope<>'one' and series_id=anchor.series_id and (p_scope='series' or scheduled_start>=anchor.scheduled_start)));
 perform 1 from public.demo_calendar_events where id=any(ids) order by id for update;
 if exists(select 1 from public.demo_calendar_events where id=any(ids) and session_id is not null) then raise exception 'session_already_started'; end if;
 if p_action='move' then
   if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '24 hours' then raise exception 'valid_start_end_required'; end if;
   day_delta:=(p_start at time zone 'Europe/Athens')::date-(anchor.scheduled_start at time zone 'Europe/Athens')::date; local_time:=(p_start at time zone 'Europe/Athens')::time;
 end if;
 -- Validate every candidate before updating any member. Existing members are excluded together.
 for item in select * from public.demo_calendar_events where id=any(ids) order by scheduled_start loop
   candidate_start:=case when p_action='move' then ((item.scheduled_start at time zone 'Europe/Athens')::date+day_delta+local_time) at time zone 'Europe/Athens' else item.scheduled_start end;
   candidate_end:=case when p_action='move' then candidate_start+(p_end-p_start) else item.scheduled_end end;
   if p_action='move' and ((candidate_start at time zone 'Europe/Athens')<>((item.scheduled_start at time zone 'Europe/Athens')::date+day_delta+local_time) or ((candidate_start-interval '1 hour') at time zone 'Europe/Athens')=(candidate_start at time zone 'Europe/Athens') or ((candidate_start+interval '1 hour') at time zone 'Europe/Athens')=(candidate_start at time zone 'Europe/Athens')) then raise exception 'invalid_local_time:%',to_char(candidate_start at time zone 'Europe/Athens','DD/MM/YYYY HH24:MI'); end if;
   if p_action<>'cancel' then
     if candidate_start<now() then raise exception 'past_appointment'; end if;
     if exists(select 1 from public.demo_calendar_events x where x.id=any(ids) and x.id<>item.id and
       (case when p_action='move' then ((x.scheduled_start at time zone 'Europe/Athens')::date+day_delta+local_time) at time zone 'Europe/Athens' else x.scheduled_start end)<candidate_end and
       (case when p_action='move' then (((x.scheduled_start at time zone 'Europe/Athens')::date+day_delta+local_time) at time zone 'Europe/Athens')+(p_end-p_start) else x.scheduled_end end)>candidate_start) then
       raise exception 'calendar_conflict:%',to_char(candidate_start at time zone 'Europe/Athens','DD/MM/YYYY HH24:MI');
     end if;
     if exists(select 1 from public.demo_calendar_events where tester_id=p_tester and status='scheduled' and not(id=any(ids)) and scheduled_start<candidate_end and scheduled_end>candidate_start) then
       raise exception 'calendar_conflict:%',to_char(candidate_start at time zone 'Europe/Athens','DD/MM/YYYY HH24:MI');
     end if;
   end if;
 end loop;
 for item in select * from public.demo_calendar_events where id=any(ids) order by id loop
   before_state:=to_jsonb(item);
   candidate_start:=case when p_action='move' then ((item.scheduled_start at time zone 'Europe/Athens')::date+day_delta+local_time) at time zone 'Europe/Athens' else item.scheduled_start end;
   candidate_end:=case when p_action='move' then candidate_start+(p_end-p_start) else item.scheduled_end end;
   update public.demo_calendar_events set scheduled_start=candidate_start,scheduled_end=candidate_end,
     status=case when p_action='cancel' then 'cancelled' else 'scheduled' end,updated_at=clock_timestamp()
     where id=item.id returning * into result;
   insert into public.demo_calendar_audit(action,event_id,before_state,after_state) values(p_action,result.id,before_state,to_jsonb(result));
 end loop;
 select * into result from public.demo_calendar_events where id=anchor.id;
 return to_jsonb(result);
end $$;
revoke all on function public.demo_calendar_edit(uuid,text,uuid,timestamptz,timestamptz,timestamptz,text,timestamptz) from public;
grant execute on function public.demo_calendar_edit(uuid,text,uuid,timestamptz,timestamptz,timestamptz,text,timestamptz) to anon,authenticated;
revoke all on function public.demo_calendar_apply_v2(uuid,text,uuid,uuid,text,timestamptz,timestamptz,text,text) from public;
revoke all on function public.demo_calendar_create_recurring(uuid,uuid,timestamptz,timestamptz,text,integer,integer) from public;
notify pgrst,'reload schema';
