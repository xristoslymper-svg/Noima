-- Prevent calendar-driven starts from bypassing the one-open-draft invariant.
-- The pilot isolation migration moved the audited implementation into private;
-- keep the public wrapper and its ownership checks unchanged.
create or replace function private.pilot_impl_demo_calendar_start_session(p_tester uuid,p_event uuid)
returns public.demo_sessions language plpgsql security definer set search_path=public,private as $$
declare e public.demo_calendar_events; s public.demo_sessions; st text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_tester::text,721));
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

 -- Serialize against direct starts from the patient folder as well.
 perform 1 from public.demo_patients where id=e.patient_id and tester_id=p_tester for update;
 if not found then raise exception 'patient_not_found'; end if;

 st:=case when e.appointment_type='initial_assessment' then 'initial_assessment' else 'follow_up' end;
 select * into s from public.demo_sessions
  where patient_id=e.patient_id and tester_id=p_tester and status='draft'
  order by created_at desc limit 1 for update;

 if s.id is not null then
  if exists(select 1 from public.demo_calendar_events other where other.session_id=s.id and other.id<>e.id) then
   raise exception 'draft_linked_elsewhere';
  end if;
  if s.session_type<>st then
   raise exception 'open_draft_conflict';
  end if;
 else
  insert into public.demo_sessions(tester_id,patient_id,session_type) values(p_tester,e.patient_id,st) returning * into s;
 end if;

 update public.demo_calendar_events set session_id=s.id,updated_at=now() where id=e.id;
 return s;
end $$;

revoke all on function private.pilot_impl_demo_calendar_start_session(uuid,uuid) from public,anon,authenticated;
