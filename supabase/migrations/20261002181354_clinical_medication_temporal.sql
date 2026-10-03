-- Medication events are the timeline. Rows retain identity; read time never advances medication state by mutation.
alter table public.demo_medications add column plan_version integer not null default 1;
create table public.demo_medication_event_revisions(
 id uuid primary key default gen_random_uuid(), tester_id uuid not null,
 event_id uuid not null unique references public.demo_medication_events(id),
 replacement_id uuid references public.demo_medication_events(id), reason text not null check(length(trim(reason))>0), created_at timestamptz not null default now()
);
alter table public.demo_medication_event_revisions enable row level security;
create policy demo_read on public.demo_medication_event_revisions for select using(true);
grant select on public.demo_medication_event_revisions to anon,authenticated;
create trigger demo_med_revision_immutable before update or delete on public.demo_medication_event_revisions for each row execute function public.demo_immutable_entry();
-- Preserve the best available original baseline for medication rows predating start events.
insert into public.demo_medication_events(tester_id,patient_id,medication_id,event_type,new_state,reason,effective_on)
select m.tester_id,m.patient_id,m.id,'started',coalesce((select e.previous_state from public.demo_medication_events e where e.medication_id=m.id and e.previous_state is not null order by e.effective_on,e.created_at limit 1),jsonb_build_object('dose',m.dose,'unit',m.unit,'frequency',m.frequency,'status','active'))||jsonb_build_object('status','active'),'Αρχική καταγεγραμμένη κατάσταση',coalesce((select nullif(e.previous_state->>'effective_from','')::date from public.demo_medication_events e where e.medication_id=m.id and e.previous_state is not null order by e.effective_on,e.created_at limit 1),m.effective_from,m.started_at)
from public.demo_medications m where not exists(select 1 from public.demo_medication_events e where e.medication_id=m.id and e.event_type='started');
create or replace function public.demo_medication_state(p_medication uuid,p_on date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m public.demo_medications; e public.demo_medication_events; st jsonb;
begin
 select * into m from demo_medications where id=p_medication;
 if m.id is null then raise exception 'medication_not_found'; end if;
 select * into e from demo_medication_events x where medication_id=m.id and effective_on<=p_on and not exists(select 1 from demo_medication_event_revisions r where r.event_id=x.id) order by effective_on desc,created_at desc,id desc limit 1;
 if e.id is null then st:=jsonb_build_object('status',case when exists(select 1 from demo_medication_events x where medication_id=m.id and not exists(select 1 from demo_medication_event_revisions r where r.event_id=x.id)) then 'planned' else 'cancelled' end);
 else st:=e.new_state||jsonb_build_object('effective_from',e.effective_on,'status',case when e.event_type='stopped' then 'stopped' else 'active' end,'ended_at',case when e.event_type='stopped' then e.effective_on else null end); end if;
 return to_jsonb(m)||st;
end $$;
create or replace function public.demo_medications_at(p_tester uuid,p_patient uuid,p_on date) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(demo_medication_state(id,p_on) order by created_at),'[]'::jsonb) from demo_medications where tester_id=p_tester and patient_id=p_patient
$$;
create or replace function public.demo_apply_due_medication_events(p_tester uuid) returns void language plpgsql as $$ begin return; end $$;

create or replace function public.demo_medication_event_write(p_tester uuid,p_medication uuid,p_session uuid,p_type text,p_dose numeric,p_unit text,p_frequency text,p_effective date,p_reason text,p_expected_version integer,p_replace uuid default null,p_cancel boolean default false)
returns public.demo_medications language plpgsql security definer set search_path=public as $$
declare m public.demo_medications; old_event public.demo_medication_events; new_id uuid; prior jsonb; state jsonb; stopped boolean:=false; e record;
begin
 select * into m from demo_medications where id=p_medication and tester_id=p_tester for update;
 if m.id is null then raise exception 'medication_not_found'; end if;
 if p_expected_version is null or m.plan_version<>p_expected_version then raise exception 'stale_medication'; end if;
 if p_session is not null and not exists(select 1 from demo_sessions where id=p_session and patient_id=m.patient_id and tester_id=p_tester and status='draft') then raise exception 'session_unavailable'; end if;
 if p_effective is null or p_type not in ('started','changed','stopped') then raise exception 'invalid_event'; end if;
 if p_replace is not null then
  select * into old_event from demo_medication_events where id=p_replace and medication_id=m.id;
  if old_event.id is null or exists(select 1 from demo_medication_event_revisions where event_id=p_replace) then raise exception 'stale_medication'; end if;
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'reason_required'; end if;
  if p_cancel and old_event.effective_on<=(now() at time zone 'Europe/Athens')::date then raise exception 'historical_correction_required'; end if;
  insert into demo_medication_event_revisions(tester_id,event_id,reason) values(p_tester,p_replace,p_reason);
 elsif p_cancel then raise exception 'event_required';
 end if;
 if not p_cancel then
  if exists(select 1 from demo_medication_events x where medication_id=m.id and effective_on=p_effective and not exists(select 1 from demo_medication_event_revisions r where r.event_id=x.id)) then raise exception 'event_date_conflict'; end if;
  prior:=demo_medication_state(m.id,p_effective);
  if p_type<>'stopped' and (p_dose is null or p_dose<=0 or length(trim(coalesce(p_unit,'')))=0 or length(trim(coalesce(p_frequency,'')))=0) then raise exception 'invalid_dose'; end if;
  state:=case when p_type='stopped' then prior||jsonb_build_object('status','stopped') else jsonb_build_object('dose',p_dose,'unit',p_unit,'frequency',p_frequency,'status','active') end;
  insert into demo_medication_events(tester_id,patient_id,medication_id,session_id,event_type,previous_state,new_state,reason,effective_on) values(p_tester,m.patient_id,m.id,p_session,p_type,prior,state,coalesce(p_reason,''),p_effective) returning id into new_id;
  if p_replace is not null then update demo_medication_event_revisions set replacement_id=new_id where event_id=p_replace; end if;
 end if;
 -- A valid course has a start followed by changes and at most a terminal stop.
 stopped:=true;
 for e in select x.* from demo_medication_events x where medication_id=m.id and not exists(select 1 from demo_medication_event_revisions r where r.event_id=x.id) order by effective_on,created_at,id loop
  if e.event_type='started' then if not stopped then raise exception 'conflicting_start'; end if; stopped:=false;
  elsif stopped then raise exception 'event_after_stop_or_before_start';
  elsif e.event_type='stopped' then stopped:=true; end if;
 end loop;
 update demo_medications set plan_version=plan_version+1,updated_at=now() where id=m.id returning * into m;
 return m;
end $$;
-- Revision is inserted once with replacement ID; allow only that transaction's one initial linkage.
drop trigger demo_med_revision_immutable on public.demo_medication_event_revisions;
create or replace function public.demo_med_revision_guard() returns trigger language plpgsql as $$ begin
 if tg_op='UPDATE' and old.replacement_id is null and new.replacement_id is not null and old.created_at=now() and (to_jsonb(old)-'replacement_id')=(to_jsonb(new)-'replacement_id') then return new; end if;
 raise exception 'immutable_record'; end $$;
create trigger demo_med_revision_immutable before update or delete on public.demo_medication_event_revisions for each row execute function public.demo_med_revision_guard();
create trigger demo_med_event_immutable before update or delete on public.demo_medication_events for each row execute function public.demo_immutable_entry();

-- Existing start/change/stop entry points remain compatible. The new UI passes explicit plan versions.
create or replace function public.demo_medication_start(p_tester uuid,p_patient uuid,p_session uuid,p_name text,p_dose numeric,p_unit text,p_frequency text,p_effective date,p_reason text default '') returns public.demo_medications language plpgsql security definer set search_path=public as $$
declare m public.demo_medications; begin
 if not exists(select 1 from demo_patients where id=p_patient and tester_id=p_tester) then raise exception 'patient_not_found'; end if;
 if length(trim(coalesce(p_name,'')))=0 then raise exception 'medication_name_required'; end if;
 insert into demo_medications(tester_id,patient_id,medication_name,dose,unit,frequency,effective_from,started_at) values(p_tester,p_patient,trim(p_name),p_dose,p_unit,p_frequency,p_effective,p_effective) returning * into m;
 return demo_medication_event_write(p_tester,m.id,p_session,'started',p_dose,p_unit,p_frequency,p_effective,p_reason,m.plan_version);
end $$;
create or replace function public.demo_medication_change(p_tester uuid,p_medication uuid,p_session uuid,p_dose numeric,p_unit text,p_frequency text,p_effective date,p_reason text default '') returns public.demo_medications language plpgsql security definer set search_path=public as $$
declare m public.demo_medications; begin select * into m from demo_medications where id=p_medication and tester_id=p_tester for update; return demo_medication_event_write(p_tester,p_medication,p_session,'changed',p_dose,p_unit,p_frequency,p_effective,p_reason,m.plan_version); end $$;
create or replace function public.demo_medication_stop(p_tester uuid,p_medication uuid,p_session uuid,p_effective date,p_reason text default '') returns public.demo_medications language plpgsql security definer set search_path=public as $$
declare m public.demo_medications; begin select * into m from demo_medications where id=p_medication and tester_id=p_tester for update; return demo_medication_event_write(p_tester,p_medication,p_session,'stopped',null,null,null,p_effective,p_reason,m.plan_version); end $$;
revoke all on function public.demo_medication_state(uuid,date),public.demo_medications_at(uuid,uuid,date),public.demo_medication_event_write(uuid,uuid,uuid,text,numeric,text,text,date,text,integer,uuid,boolean) from public;
grant execute on function public.demo_medications_at(uuid,uuid,date),public.demo_medication_event_write(uuid,uuid,uuid,text,numeric,text,text,date,text,integer,uuid,boolean) to anon,authenticated;

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
insert into demo_medication_events(tester_id,patient_id,medication_id,event_type,new_state,reason,effective_on) select tester_id,patient_id,id,'started',jsonb_build_object('dose',dose,'unit',unit,'frequency',frequency,'status','active'),'Αρχική κατάσταση demo',effective_from from demo_medications m where tester_id=p_tester and not exists(select 1 from demo_medication_events where medication_id=m.id);
end $$;
create or replace function public.demo_seed_maria_record(p_tester uuid) returns void
language plpgsql security definer set search_path=public as $$
declare maria uuid:=md5(p_tester::text||':maria')::uuid; sid uuid:=md5(p_tester::text||':maria:baseline:2026-09-17')::uuid; med uuid;
begin
 if p_tester is null then raise exception 'tester_required'; end if;
 if not exists(select 1 from public.demo_patients where id=maria and tester_id=p_tester) then return; end if;
 if not exists(select 1 from public.demo_sessions where patient_id=maria and tester_id=p_tester and status='completed') then
  insert into public.demo_sessions(id,tester_id,patient_id,session_type,status,version,started_at,completed_at,created_at,updated_at) values(sid,p_tester,maria,'follow_up','completed',9,'2026-09-17 11:00+03','2026-09-17 11:50+03','2026-09-17 11:00+03','2026-09-17 11:50+03') on conflict(id) do nothing;
  insert into public.demo_session_sections(tester_id,patient_id,session_id,section_key,content,source,version,updated_at) values
  (p_tester,maria,sid,'interview','Σημαντική βελτίωση διάθεσης και άγχους. Δεν αναφέρει κρίσεις πανικού τις τελευταίες δύο εβδομάδες. Ύπνος 6–7 ώρες με μία αφύπνιση. Επέστρεψε σε πλήρες ωράριο εργασίας.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'functioning','Πλήρης επιστροφή στην εργασία από 15/09. Παραμένει άγχος πριν από σημαντικές παρουσιάσεις.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'effects','Μειωμένη libido, μέτρια ενόχληση, υπό παρακολούθηση.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'adherence','Καλή συμμόρφωση. Αναφέρει περίπου μία παράλειψη δόσης τον μήνα.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'mse','Σε εγρήγορση και πλήρως προσανατολισμένη. Συνεργάσιμη. Λόγος φυσιολογικού ρυθμού και έντασης. Διάθεση βελτιωμένη, συναίσθημα ανάλογο. Σκέψη οργανωμένη, χωρίς ψυχωτικά στοιχεία.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'assessment','Μείζον καταθλιπτικό επεισόδιο και διαταραχή πανικού με σαφή κλινική βελτίωση υπό την τρέχουσα αγωγή. Παραμένει σεξουαλική δυσλειτουργία πιθανώς σχετιζόμενη με SSRI.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'plan','Συνέχιση Sertraline 100 mg το πρωί και Trazodone 50 mg το βράδυ. Παρακολούθηση σεξουαλικής δυσλειτουργίας, άγχους σε παρουσιάσεις και συμμόρφωσης.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'review','Επανεκτίμηση σε περίπου δύο εβδομάδες. Επανέλεγχος αυτοκτονικού ιδεασμού και ανοχής αγωγής.','manual',1,'2026-09-17 11:45+03') on conflict(session_id,section_key) do nothing;
  insert into public.demo_risk_assessments(session_id,tester_id,patient_id,suicidal_ideation,intent,plan,self_harm,attempt_history,protective_factors,clinical_note,version,updated_at)
  values(sid,p_tester,maria,'negative','negative','negative','negative','negative','Σχέση, αδελφή, εργασία, θεραπευτική συμμαχία και καλή συμμόρφωση.','Αρνείται αυτοκτονικό ιδεασμό, πρόθεση ή σχέδιο. Δεν αναφέρεται ιστορικό απόπειρας.',1,'2026-09-17 11:45+03') on conflict(session_id) do nothing;
 end if;
 if not exists(select 1 from public.demo_medications where patient_id=maria and medication_name='Trazodone') then
  insert into public.demo_medications(tester_id,patient_id,medication_name,dose,unit,frequency,effective_from,started_at,notes) values(p_tester,maria,'Trazodone',50,'mg','1× βράδυ','2026-06-20','2026-06-20','Όφελος στον ύπνο. Παροδική πρωινή υπνηλία.') returning id into med;
  insert into public.demo_medication_events(tester_id,patient_id,medication_id,session_id,event_type,new_state,reason,effective_on) values(p_tester,maria,med,sid,'started',jsonb_build_object('dose',50,'unit','mg','frequency','1× βράδυ','status','active'),'Ύπνος','2026-06-20');
 end if;
end $$;


