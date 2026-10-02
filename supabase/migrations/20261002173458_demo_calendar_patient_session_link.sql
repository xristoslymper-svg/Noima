-- Fictional demo only: unify the browser tester's calendar with patient/session IDs.
alter table public.demo_calendar_events
  add column if not exists tester_id uuid,
  add column if not exists patient_id uuid,
  add column if not exists session_id uuid;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='demo_calendar_events_patient_fk') then
  alter table public.demo_calendar_events add constraint demo_calendar_events_patient_fk foreign key(patient_id) references public.demo_patients(id) on delete set null;
 end if;
 if not exists(select 1 from pg_constraint where conname='demo_calendar_events_session_fk') then
  alter table public.demo_calendar_events add constraint demo_calendar_events_session_fk foreign key(session_id) references public.demo_sessions(id) on delete set null;
 end if;
end $$;

create index if not exists demo_calendar_tester_start_idx on public.demo_calendar_events(tester_id,scheduled_start);
create index if not exists demo_calendar_patient_idx on public.demo_calendar_events(tester_id,patient_id,scheduled_start);

create or replace function public.demo_tester_bootstrap(p_tester uuid) returns void language plpgsql security definer set search_path=public as $$
declare maria uuid:=md5(p_tester::text||':maria')::uuid; giannis uuid:=md5(p_tester::text||':giannis')::uuid; eleni uuid:=md5(p_tester::text||':eleni')::uuid; kostas uuid:=md5(p_tester::text||':kostas')::uuid; d date:=current_date; ts timestamptz;
begin
 if p_tester is null then raise exception 'tester_required'; end if;
 insert into public.demo_patients(id,tester_id,first_name,last_name,reported_age,note,chief_complaint) values
 (maria,p_tester,'Μαρία','',32,'Μείζον καταθλιπτικό επεισόδιο · Διαταραχή πανικού','Παρακολούθηση διάθεσης, άγχους και ανοχής αγωγής.'),
 (giannis,p_tester,'Γιάννης','Π.',41,'Αγχώδης διαταραχή','Παρακολούθηση άγχους.'),
 (eleni,p_tester,'Ελένη','Δ.',28,'Παρακολούθηση αγωγής','Παρακολούθηση αποτελεσματικότητας και ανεπιθύμητων ενεργειών.'),
 (kostas,p_tester,'Κώστας','Σ.',37,'Νέα αρχική αξιολόγηση','Επίμονο άγχος και δυσκολία ύπνου περίπου 4 μήνες.') on conflict(id) do nothing;
 insert into public.demo_patient_history(patient_id,tester_id,psychiatric_history,medical_history,previous_treatments,family_history,substance_history,social_functioning)
 values(maria,p_tester,'Καταθλιπτικά και αγχώδη συμπτώματα με κρίσεις πανικού.','Δεν έχει καταγραφεί σημαντικό σωματικό ιστορικό.','Brief therapy στην ηλικία των 26.','Μητέρα με ιστορικό κατάθλιψης.','Αλκοόλ 1–2 φορές/εβδομάδα. Δεν αναφέρονται άλλες ουσίες.','Επέστρεψε σε πλήρες ωράριο εργασίας.') on conflict(patient_id) do nothing;
 if not exists(select 1 from public.demo_medications where patient_id=maria and medication_name='Sertraline') then
  insert into public.demo_medications(tester_id,patient_id,medication_name,dose,unit,frequency,effective_from,started_at,notes) values(p_tester,maria,'Sertraline',100,'mg','1× πρωί','2026-09-03','2026-06-06','Μειωμένη libido υπό παρακολούθηση');
 end if;
 if not exists(select 1 from public.demo_calendar_events where tester_id=p_tester) then
  ts:=make_timestamptz(extract(year from d)::int,extract(month from d)::int,extract(day from d)::int,11,0,0,'Europe/Athens');
  insert into public.demo_calendar_events(tester_id,patient_id,patient_name,appointment_type,detail,scheduled_start,scheduled_end,readiness,readiness_label,status) values
  (p_tester,maria,'Μαρία','follow_up','Παρακολούθηση',ts,ts+interval '50 minutes','ready','Έτοιμη','scheduled'),
  (p_tester,giannis,'Γιάννης Π.','follow_up','Follow-up',ts+interval '90 minutes',ts+interval '140 minutes','waiting','Αναμένει GAD-7','scheduled'),
  (p_tester,eleni,'Ελένη Δ.','follow_up','Παρακολούθηση αγωγής',ts+interval '3 hours',ts+interval '3 hours 50 minutes','ready','Έτοιμη','scheduled'),
  (p_tester,kostas,'Κώστας Σ.','initial_assessment','Αρχική αξιολόγηση',ts+interval '5 hours',ts+interval '5 hours 50 minutes','new','Intake ολοκληρωμένο','scheduled');
 end if;
end $$;

create or replace function public.demo_calendar_apply_v2(p_tester uuid,p_action text,p_event_id uuid default null,p_patient_id uuid default null,p_patient_name text default null,p_scheduled_start timestamptz default null,p_scheduled_end timestamptz default null,p_appointment_type text default 'follow_up',p_detail text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_before public.demo_calendar_events%rowtype; v_after public.demo_calendar_events%rowtype; v_patient public.demo_patients%rowtype; v_conflict boolean;
begin
 if p_tester is null then raise exception 'tester_required'; end if;
 if p_action not in ('move','cancel','create','schedule_follow_up') then raise exception 'unsupported_action'; end if;
 if p_action in ('move','cancel') then select * into v_before from public.demo_calendar_events where id=p_event_id and tester_id=p_tester and status='scheduled' for update; if not found then raise exception 'event_not_found'; end if; end if;
 if p_action='cancel' then
  update public.demo_calendar_events set status='cancelled',updated_at=now() where id=p_event_id and tester_id=p_tester returning * into v_after;
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

create or replace function public.demo_calendar_start_session(p_tester uuid,p_event uuid)
returns public.demo_sessions language plpgsql security definer set search_path=public as $$
declare e public.demo_calendar_events; s public.demo_sessions; st text;
begin
 select * into e from public.demo_calendar_events where id=p_event and tester_id=p_tester and status='scheduled' for update;
 if not found or e.patient_id is null then raise exception 'appointment_unavailable'; end if;
 if e.session_id is not null then select * into s from public.demo_sessions where id=e.session_id and tester_id=p_tester; if found then return s; end if; end if;
 select * into s from public.demo_sessions where patient_id=e.patient_id and tester_id=p_tester and status='draft' order by created_at desc limit 1;
 if s.id is null then st:=case when e.appointment_type='initial_assessment' then 'initial_assessment' else 'follow_up' end; insert into public.demo_sessions(tester_id,patient_id,session_type) values(p_tester,e.patient_id,st) returning * into s; end if;
 update public.demo_calendar_events set session_id=s.id,updated_at=now() where id=e.id;
 return s;
end $$;

grant execute on function public.demo_calendar_apply_v2(uuid,text,uuid,uuid,text,timestamptz,timestamptz,text,text) to anon,authenticated;
grant execute on function public.demo_calendar_start_session(uuid,uuid) to anon,authenticated;
