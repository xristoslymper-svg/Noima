-- Several unfinished visits may coexist. Explicit operation IDs and appointment
-- row locks, rather than a patient-wide unique index, prevent duplicate starts.
drop index if exists public.demo_one_draft_session;
create index if not exists demo_open_sessions_by_patient on public.demo_sessions(tester_id,patient_id,started_at desc) where status='draft';

-- Explicit new visits and optional clinical content. New entry points keep the
-- deployed legacy clients unchanged. Apply only to an isolated preview first.
create function public.demo_visit_create(p_tester uuid,p_patient uuid,p_type text,p_request uuid,p_appointment uuid default null)
returns public.demo_sessions language plpgsql security definer set search_path='' as $$
declare s public.demo_sessions; e public.demo_calendar_events;
begin
 perform private.pilot_assert_owner(p_tester);
 if p_request is null or p_type is null or p_type not in ('initial_assessment','follow_up') then raise exception 'invalid_session_type'; end if;
 perform 1 from public.demo_patients where id=p_patient and tester_id=p_tester for update;
 if not found then raise exception 'patient_not_found'; end if;
 if p_appointment is not null then
  select * into e from public.demo_calendar_events where id=p_appointment and tester_id=p_tester and patient_id=p_patient for update;
  if not found then raise exception 'appointment_unavailable'; end if;
  if e.session_id is not null then
   select * into s from public.demo_sessions where id=e.session_id and tester_id=p_tester and patient_id=p_patient;
   if not found then raise exception 'calendar_session_patient_mismatch'; end if;
   return s;
  end if;
  if e.status<>'scheduled' then raise exception 'appointment_unavailable'; end if;
  if e.appointment_type<>p_type then raise exception 'invalid_session_type'; end if;
 end if;
 select * into s from public.demo_sessions where id=p_request;
 if found then
  if s.tester_id<>p_tester or s.patient_id<>p_patient or s.session_type<>p_type then raise exception 'request_conflict'; end if;
  if exists(select 1 from public.demo_calendar_events where session_id=s.id and id is distinct from p_appointment) then raise exception 'request_conflict'; end if;
 else
  insert into public.demo_sessions(id,tester_id,patient_id,session_type)
  values(p_request,p_tester,p_patient,p_type) returning * into s;
 end if;
 if p_appointment is not null then
  update public.demo_calendar_events set session_id=s.id,updated_at=now() where id=e.id;
 end if;
 return s;
end $$;
revoke all on function public.demo_visit_create(uuid,uuid,text,uuid,uuid) from public,anon;
grant execute on function public.demo_visit_create(uuid,uuid,text,uuid,uuid) to authenticated;

-- No content is required and no absent finding is inferred. Ownership, explicit
-- confirmation, optimistic versions, immutable records and atomic task/calendar
-- completion remain mandatory.
create function public.demo_visit_register(p_tester uuid,p_session uuid,p_expected_version integer,p_confirmed boolean,p_expected_closure_version integer default null)
returns public.demo_sessions language plpgsql security definer set search_path='' as $$
declare s public.demo_sessions; v jsonb; k text; body text; sec public.demo_session_sections;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
 if not found then raise exception 'session_unavailable'; end if;
 if p_confirmed is distinct from true then raise exception 'confirmation_required'; end if;
 if s.status='completed' then return s; end if;
 if s.status<>'draft' then raise exception 'session_unavailable'; end if;
 if p_expected_version is null or s.version<>p_expected_version then raise exception 'stale_session'; end if;
 if p_expected_closure_version is not null and p_expected_closure_version<>s.closure_version then raise exception 'stale_closure'; end if;
 v:=s.closure_draft;
 if v is not null then
  -- Only explicitly written content is projected into the same visit.
  for k in select unnest(array['interview','assessment','plan','review','adherence']) loop
   body:=case k
    when 'interview' then coalesce(nullif(trim(v->>'transcript'),''),v->>'clinical_state_summary')
    when 'assessment' then v->>'clinical_state_summary'
    when 'plan' then v->>'treatment_decision'
    when 'review' then v->>'next_review_focus'
    else v->>'adherence' end;
   select * into sec from public.demo_session_sections where session_id=s.id and section_key=k;
   if length(trim(coalesce(body,'')))>0 and (sec.id is null or length(trim(sec.content))=0) then
    perform public.demo_session_save_section(p_tester,s.id,k,body,'manual',sec.version);
   end if;
  end loop;
  update public.demo_sessions set continuity=v||jsonb_build_object('session_id',s.id,'approved_at',now(),'approved_by',auth.uid()),closure_draft=null
  where id=s.id;
 end if;
 update public.demo_sessions set status='completed',completed_at=now(),version=version+1,updated_at=now()
 where id=s.id returning * into s;
 update public.demo_calendar_events set status='completed',updated_at=now()
 where tester_id=p_tester and patient_id=s.patient_id and session_id=s.id and status='scheduled';
 update public.demo_tasks set status='completed',updated_at=now()
 where tester_id=p_tester and patient_id=s.patient_id and source_session_id=s.id and status='open';
 return s;
end $$;
revoke all on function public.demo_visit_register(uuid,uuid,integer,boolean,integer) from public,anon;
grant execute on function public.demo_visit_register(uuid,uuid,integer,boolean,integer) to authenticated;
