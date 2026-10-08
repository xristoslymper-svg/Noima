-- Audit fixes: exact AMKA routing and identity race protection; same-day terminal stop.
-- No data rewrite. Preserve existing ownership wrappers and private implementation grants.

create or replace function public.demo_intake_resolve(p_tester uuid,p_id uuid,p_patient uuid default null,p_create_new boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.demo_intakes; p public.demo_patients; e public.demo_calendar_events; before_event jsonb;
 first_name text;last_name text;phone text;email text;amka text;address text;contact_phone text;age integer;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into a from private.demo_intakes where id=p_id and tester_id=p_tester and status='conflict' for update;
 if not found then raise exception 'intake_conflict_unavailable'; end if;
 if (p_patient is null)=(not p_create_new) then raise exception 'resolution_required'; end if;

 -- Serialize identity resolution with unattached submission for this workspace.
 perform pg_advisory_xact_lock(hashtextextended(p_tester::text,841));
 amka:=regexp_replace(coalesce(a.identity->>'amka',''),'[^0-9]','','g');
 if p_patient is not null then
   select * into p from public.demo_patients where id=p_patient and tester_id=p_tester;
   if not found then raise exception 'patient_not_found'; end if;
   -- A possible-match label is a snapshot, not permission to ignore a later
   -- exact match. Recheck under the identity lock before routing clinical data.
   if (a.conflict->>'type'='amka' or (amka<>'' and exists(
     select 1 from public.demo_patients dp where dp.tester_id=p_tester and dp.amka=regexp_replace(coalesce(a.identity->>'amka',''),'[^0-9]','','g')
   ))) and (amka='' or coalesce(p.amka,'')<>amka) then
     raise exception 'amka_conflict_requires_matching_patient';
   end if;
 else
   if amka<>'' and exists(select 1 from public.demo_patients dp where dp.tester_id=p_tester and dp.amka=regexp_replace(coalesce(a.identity->>'amka',''),'[^0-9]','','g')) then
     raise exception 'amka_conflict_requires_existing_patient';
   end if;
   if a.conflict->>'type'='amka' then raise exception 'amka_conflict_requires_existing_patient'; end if;
   first_name:=trim(coalesce(a.identity->>'first_name',''));last_name:=trim(coalesce(a.identity->>'last_name',''));
   phone:=trim(coalesce(a.identity->>'phone',''));email:=lower(trim(coalesce(a.identity->>'email','')));
   amka:=regexp_replace(coalesce(a.identity->>'amka',''),'[^0-9]','','g');address:=trim(coalesce(a.identity->>'address',''));
   contact_phone:=trim(coalesce(a.identity->>'contact_phone',''));
   begin age:=nullif(trim(coalesce(a.identity->>'age','')),'')::integer; exception when others then age:=null; end;
   insert into public.demo_patients(tester_id,first_name,last_name,reported_age,phone,landline,contact_phone,amka,address,email,chief_complaint)
   values(p_tester,first_name,last_name,age,phone,'',contact_phone,amka,address,email,'') returning * into p;
   insert into public.demo_patient_history(patient_id,tester_id) values(p.id,p_tester) on conflict(patient_id) do nothing;
 end if;

 if a.appointment_id is not null then
   select * into e from public.demo_calendar_events where id=a.appointment_id and tester_id=p_tester and status='scheduled' for update;
   if not found or (e.patient_id is not null and e.patient_id<>p.id) then raise exception 'appointment_unavailable'; end if;
   before_event:=to_jsonb(e);
   update public.demo_calendar_events set patient_id=p.id,patient_name=trim(p.first_name||' '||p.last_name),
    provisional_phone='',provisional_email='',readiness='new',readiness_label='Νέος ασθενής · intake ολοκληρώθηκε',updated_at=clock_timestamp()
    where id=e.id returning * into e;
   insert into public.demo_calendar_audit(action,event_id,before_state,after_state) values('intake_link',e.id,before_event,to_jsonb(e));
 end if;
 a.patient_id:=p.id;
 perform private.intake_materialize(a,p.id,a.history_answers,coalesce(a.psychometric_answers,'{}'::jsonb));
 update private.demo_intakes set patient_id=p.id,status='submitted',submitted_at=coalesce(submitted_at,now()),conflict=null where id=a.id;
 return jsonb_build_object('status','submitted','patient_id',p.id);
end $$;
revoke all on function public.demo_intake_resolve(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.demo_intake_resolve(uuid,uuid,uuid,boolean) to authenticated;

create or replace function private.pilot_impl_demo_medication_event_write(p_tester uuid,p_medication uuid,p_session uuid,p_type text,p_dose numeric,p_unit text,p_frequency text,p_effective date,p_reason text,p_expected_version integer,p_replace uuid default null,p_cancel boolean default false)
returns public.demo_medications language plpgsql security definer set search_path='' as $$
declare m public.demo_medications; old_event public.demo_medication_events; new_id uuid; prior jsonb; state jsonb; stopped boolean:=false; e record;
begin
 select * into m from public.demo_medications where id=p_medication and tester_id=p_tester for update;
 if m.id is null then raise exception 'medication_not_found'; end if;
 if p_expected_version is null or m.plan_version<>p_expected_version then raise exception 'stale_medication'; end if;
 if p_session is not null and not exists(select 1 from public.demo_sessions where id=p_session and patient_id=m.patient_id and tester_id=p_tester and status='draft') then raise exception 'session_unavailable'; end if;
 if p_effective is null or p_type not in ('started','changed','stopped') then raise exception 'invalid_event'; end if;
 if p_replace is not null then
  select * into old_event from public.demo_medication_events where id=p_replace and medication_id=m.id;
  if old_event.id is null or exists(select 1 from public.demo_medication_event_revisions where event_id=p_replace) then raise exception 'stale_medication'; end if;
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'reason_required'; end if;
  if p_cancel and old_event.effective_on<=(now() at time zone 'Europe/Athens')::date then raise exception 'historical_correction_required'; end if;
  insert into public.demo_medication_event_revisions(tester_id,event_id,reason) values(p_tester,p_replace,p_reason);
 elsif p_cancel then raise exception 'event_required';
 end if;
 if not p_cancel then
  if p_type<>'stopped' and exists(select 1 from public.demo_medication_events x where medication_id=m.id and effective_on=p_effective and not exists(select 1 from public.demo_medication_event_revisions r where r.event_id=x.id)) then raise exception 'event_date_conflict'; end if;
  prior:=public.demo_medication_state(m.id,p_effective);
  if p_type<>'stopped' and (p_dose is null or p_dose<=0 or length(trim(coalesce(p_unit,'')))=0 or length(trim(coalesce(p_frequency,'')))=0) then raise exception 'invalid_dose'; end if;
  state:=case when p_type='stopped' then prior||jsonb_build_object('status','stopped') else jsonb_build_object('dose',p_dose,'unit',p_unit,'frequency',p_frequency,'status','active') end;
  insert into public.demo_medication_events(tester_id,patient_id,medication_id,session_id,event_type,previous_state,new_state,reason,effective_on,created_at) values(p_tester,m.patient_id,m.id,p_session,p_type,prior,state,coalesce(p_reason,''),p_effective,clock_timestamp()) returning id into new_id;
  if p_replace is not null then update public.demo_medication_event_revisions set replacement_id=new_id where event_id=p_replace; end if;
 end if;
 -- A valid course has a start followed by changes and at most a terminal stop.
 stopped:=true;
 for e in select x.* from public.demo_medication_events x where medication_id=m.id and not exists(select 1 from public.demo_medication_event_revisions r where r.event_id=x.id) order by effective_on,created_at,id loop
  if e.event_type='started' then if not stopped then raise exception 'conflicting_start'; end if; stopped:=false;
  elsif stopped then raise exception 'event_after_stop_or_before_start';
  elsif e.event_type='stopped' then stopped:=true; end if;
 end loop;
 update public.demo_medications set plan_version=plan_version+1,updated_at=now() where id=m.id returning * into m;
 return m;
end $$;

revoke all on function private.pilot_impl_demo_medication_event_write(uuid,uuid,uuid,text,numeric,text,text,date,text,integer,uuid,boolean) from public,anon,authenticated;

-- Manual creation/demographic edits must share the same identity lock as intake.
-- Do not rewrite existing records or silently merge folders. Unchanged legacy
-- AMKAs remain editable in other fields, but a new duplicate cannot be introduced.
create or replace function private.demo_patient_amka_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.amka,'')='' then return new; end if;
 if tg_op='UPDATE' and new.amka is not distinct from old.amka and new.tester_id is not distinct from old.tester_id then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.tester_id::text,841));
 if exists(select 1 from public.demo_patients dp where dp.tester_id=new.tester_id and dp.id<>new.id and dp.amka=new.amka) then
   raise exception 'amka_conflict';
 end if;
 return new;
end $$;
revoke all on function private.demo_patient_amka_guard() from public,anon,authenticated;
create trigger demo_patient_amka_guard before insert or update of amka,tester_id on public.demo_patients
for each row execute function private.demo_patient_amka_guard();
