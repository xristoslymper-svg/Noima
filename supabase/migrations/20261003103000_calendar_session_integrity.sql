-- Keep calendar and clinical session state in one consistent graph.
alter table public.demo_calendar_events drop constraint if exists demo_calendar_events_status_check;
alter table public.demo_calendar_events add constraint demo_calendar_events_status_check check(status in ('scheduled','cancelled','completed'));

create or replace function public.demo_calendar_link_guard() returns trigger language plpgsql set search_path=public as $$
declare s public.demo_sessions;
begin
 if new.session_id is null then return new; end if;
 select * into s from public.demo_sessions where id=new.session_id;
 if s.id is null or new.patient_id is null or s.patient_id<>new.patient_id or (new.tester_id is not null and s.tester_id<>new.tester_id) then
  raise exception 'calendar_session_patient_mismatch';
 end if;
 if exists(select 1 from public.demo_calendar_events e where e.session_id=new.session_id and e.id<>new.id) then
  raise exception 'session_already_linked';
 end if;
 return new;
end $$;
drop trigger if exists demo_calendar_link_guard on public.demo_calendar_events;
create trigger demo_calendar_link_guard before insert or update of patient_id,session_id,tester_id on public.demo_calendar_events for each row execute function public.demo_calendar_link_guard();

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
 select * into s from public.demo_sessions where patient_id=e.patient_id and tester_id=p_tester and status='draft' order by created_at desc limit 1;
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

create or replace function public.demo_session_finalize(p_tester uuid,p_session uuid,p_expected_version integer)
returns public.demo_sessions language plpgsql security definer set search_path=public as $$
declare s public.demo_sessions; missing text;
begin
 select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
 if s.id is null then raise exception 'session_unavailable'; end if;
 if s.status='completed' then return s; end if;
 if p_expected_version is null or s.version<>p_expected_version then raise exception 'stale_session'; end if;
 select string_agg(u.section,', ') into missing from unnest(array['interview','mse','assessment','plan','review']) as u(section)
 where not exists(select 1 from public.demo_session_sections where session_id=p_session and section_key=u.section and length(trim(content))>0);
 if missing is not null then raise exception 'missing_sections:%',missing; end if;
 if not exists(select 1 from public.demo_risk_assessments where session_id=p_session and suicidal_ideation<>'not_assessed') then raise exception 'risk_required'; end if;
 update public.demo_sessions set status='completed',completed_at=now(),version=version+1,updated_at=now() where id=p_session returning * into s;
 update public.demo_calendar_events set status='completed',updated_at=now() where tester_id=p_tester and session_id=p_session and status='scheduled';
 return s;
end $$;

create or replace function public.demo_calendar_apply_v2(p_tester uuid,p_action text,p_event_id uuid default null,p_patient_id uuid default null,p_patient_name text default null,p_scheduled_start timestamptz default null,p_scheduled_end timestamptz default null,p_appointment_type text default 'follow_up',p_detail text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_before public.demo_calendar_events%rowtype; v_after public.demo_calendar_events%rowtype; v_patient public.demo_patients%rowtype; v_conflict boolean;
begin
 if p_tester is null then raise exception 'tester_required'; end if;
 if p_action not in ('move','cancel','create','schedule_follow_up') then raise exception 'unsupported_action'; end if;
 if p_action in ('move','cancel') then select * into v_before from public.demo_calendar_events where id=p_event_id and tester_id=p_tester and status='scheduled' for update; if not found then raise exception 'event_not_found'; end if; end if;
 if p_action='cancel' then
  update public.demo_calendar_events set status='cancelled',session_id=null,updated_at=now() where id=p_event_id and tester_id=p_tester returning * into v_after;
 elsif p_action='move' then
  if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end<=p_scheduled_start then raise exception 'valid_start_end_required'; end if;
  select exists(select 1 from public.demo_calendar_events e where e.tester_id=p_tester and e.status='scheduled' and e.id<>p_event_id and e.scheduled_start<p_scheduled_end and e.scheduled_end>p_scheduled_start) into v_conflict;
  if v_conflict then raise exception 'calendar_conflict'; end if;
  update public.demo_calendar_events set scheduled_start=p_scheduled_start,scheduled_end=p_scheduled_end,updated_at=now() where id=p_event_id and tester_id=p_tester returning * into v_after;
 else
  if p_patient_id is null then raise exception 'patient_required'; end if;
  select * into v_patient from public.demo_patients where id=p_patient_id and tester_id=p_tester; if not found then raise exception 'patient_not_found'; end if;
  if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end<=p_scheduled_start then raise exception 'valid_start_end_required'; end if;
  select exists(select 1 from public.demo_calendar_events e where e.tester_id=p_tester and e.status='scheduled' and e.scheduled_start<p_scheduled_end and e.scheduled_end>p_scheduled_start) into v_conflict;
  if v_conflict then raise exception 'calendar_conflict'; end if;
  insert into public.demo_calendar_events(tester_id,patient_id,patient_name,appointment_type,detail,scheduled_start,scheduled_end,readiness,readiness_label,status)
  values(p_tester,v_patient.id,trim(v_patient.first_name||' '||v_patient.last_name),case when p_action='schedule_follow_up' then 'follow_up' else coalesce(nullif(p_appointment_type,''),'follow_up') end,coalesce(p_detail,''),p_scheduled_start,p_scheduled_end,'ready','Έτοιμη','scheduled') returning * into v_after;
 end if;
 insert into public.demo_calendar_audit(action,event_id,before_state,after_state) values(p_action,v_after.id,case when p_action in ('move','cancel') then to_jsonb(v_before) else null end,to_jsonb(v_after));
 return to_jsonb(v_after);
end $$;

revoke all on function public.demo_calendar_apply(text,uuid,text,timestamptz,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.demo_calendar_start_session(uuid,uuid) from public;
grant execute on function public.demo_calendar_start_session(uuid,uuid) to anon,authenticated;
