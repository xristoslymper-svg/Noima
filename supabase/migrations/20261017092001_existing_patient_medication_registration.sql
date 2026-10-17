-- A recorded existing treatment is not a new prescription or an encounter.
-- Missing clinical dates remain NULL; created_at records entry time separately.
alter table public.demo_medications
 alter column started_at drop not null,
 alter column started_at drop default,
 alter column effective_from drop not null,
 alter column effective_from drop default,
 add column record_source text not null default 'prescribed'
   check(record_source in ('prescribed','existing','historical')),
 add column recorded_by uuid references auth.users(id),
 add column registration_request_id uuid unique,
 add column registration_payload jsonb;

create function private.demo_medication_registration_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.registration_request_id is not null and
    (to_jsonb(new)-'plan_version'-'updated_at') is distinct from
    (to_jsonb(old)-'plan_version'-'updated_at') then
   raise exception 'medication_registration_immutable';
 end if;
 return new;
end $$;
create trigger medication_registration_immutable before update on public.demo_medications
 for each row execute function private.demo_medication_registration_guard();
revoke all on function private.demo_medication_registration_guard() from public,anon,authenticated;

-- Existing medication rows form the approved baseline. Later real changes still
-- use the existing append-only event/revision model. No invented start event.
create or replace function public.demo_medication_state(p_medication uuid,p_on date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.demo_medications; e public.demo_medication_events; st jsonb;
begin
 select * into m from public.demo_medications where id=p_medication;
 if m.id is null then raise exception 'medication_not_found'; end if;
 perform private.pilot_assert_owner(m.tester_id);
 select * into e from public.demo_medication_events x
  where medication_id=m.id and effective_on<=p_on
    and not exists(select 1 from public.demo_medication_event_revisions r where r.event_id=x.id)
  order by effective_on desc,created_at desc,id desc limit 1;
 if e.id is null then
   if m.record_source in ('existing','historical') then
     st:=jsonb_build_object('status',case
       when m.started_at>p_on then 'planned'
       when m.record_source='historical' and m.ended_at>p_on then 'active'
       else m.status end);
   else
     st:=jsonb_build_object('status',case when exists(
       select 1 from public.demo_medication_events x where medication_id=m.id
        and not exists(select 1 from public.demo_medication_event_revisions r where r.event_id=x.id)
     ) then 'planned' else 'cancelled' end);
   end if;
 else
   st:=e.new_state||jsonb_build_object('effective_from',e.effective_on,
     'status',case when e.event_type='stopped' then 'stopped' else 'active' end,
     'ended_at',case when e.event_type='stopped' then e.effective_on else null end);
 end if;
 return to_jsonb(m)||st;
end $$;
revoke all on function public.demo_medication_state(uuid,date) from public,anon,authenticated;

-- Preserve versioned corrections and temporal validation, allowing the imported
-- ongoing baseline to precede its first actual dose-change or stop event.
create or replace function private.pilot_impl_demo_medication_event_write(
 p_tester uuid,p_medication uuid,p_session uuid,p_type text,p_dose numeric,p_unit text,p_frequency text,
 p_effective date,p_reason text,p_expected_version integer,p_replace uuid default null,p_cancel boolean default false
) returns public.demo_medications language plpgsql security definer set search_path='' as $$
declare m public.demo_medications; old_event public.demo_medication_events; new_id uuid; prior jsonb; state jsonb; stopped boolean; e record;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into m from public.demo_medications where id=p_medication and tester_id=p_tester for update;
 if m.id is null then raise exception 'medication_not_found'; end if;
 if p_expected_version is null or m.plan_version<>p_expected_version then raise exception 'stale_medication'; end if;
 if p_session is not null and not exists(select 1 from public.demo_sessions where id=p_session and patient_id=m.patient_id and tester_id=p_tester and status='draft') then raise exception 'session_unavailable'; end if;
 if p_effective is null or p_type not in ('started','changed','stopped') then raise exception 'invalid_event'; end if;
 if m.record_source in ('existing','historical') and m.started_at is not null and p_effective<m.started_at then raise exception 'event_after_stop_or_before_start'; end if;
 if p_replace is not null then
   select * into old_event from public.demo_medication_events where id=p_replace and medication_id=m.id;
   if old_event.id is null or exists(select 1 from public.demo_medication_event_revisions where event_id=p_replace) then raise exception 'stale_medication'; end if;
   if length(trim(coalesce(p_reason,'')))=0 then raise exception 'reason_required'; end if;
   if p_cancel and old_event.effective_on<=(now() at time zone 'Europe/Athens')::date then raise exception 'historical_correction_required'; end if;
   insert into public.demo_medication_event_revisions(tester_id,event_id,reason) values(p_tester,p_replace,p_reason);
 elsif p_cancel then raise exception 'event_required';
 end if;
 if not p_cancel then
   if exists(select 1 from public.demo_medication_events x where medication_id=m.id and effective_on=p_effective and not exists(select 1 from public.demo_medication_event_revisions r where r.event_id=x.id)) then raise exception 'event_date_conflict'; end if;
   prior:=public.demo_medication_state(m.id,p_effective);
   if p_type<>'stopped' and (p_dose is null or p_dose<=0 or p_dose::text in ('NaN','Infinity','-Infinity') or length(trim(coalesce(p_unit,'')))=0 or length(trim(coalesce(p_frequency,'')))=0) then raise exception 'invalid_dose'; end if;
   state:=case when p_type='stopped' then prior||jsonb_build_object('status','stopped') else jsonb_build_object('dose',p_dose,'unit',p_unit,'frequency',p_frequency,'status','active') end;
   insert into public.demo_medication_events(tester_id,patient_id,medication_id,session_id,event_type,previous_state,new_state,reason,effective_on)
   values(p_tester,m.patient_id,m.id,p_session,p_type,prior,state,coalesce(p_reason,''),p_effective) returning id into new_id;
   if p_replace is not null then update public.demo_medication_event_revisions set replacement_id=new_id where event_id=p_replace; end if;
 end if;
 stopped:=m.record_source<>'existing';
 for e in select x.* from public.demo_medication_events x where medication_id=m.id
   and not exists(select 1 from public.demo_medication_event_revisions r where r.event_id=x.id)
   order by effective_on,created_at,id loop
   if m.record_source='historical' and m.ended_at is not null and e.effective_on<m.ended_at then raise exception 'event_after_stop_or_before_start'; end if;
   if e.event_type='started' then if not stopped then raise exception 'conflicting_start'; end if; stopped:=false;
   elsif stopped then raise exception 'event_after_stop_or_before_start';
   elsif e.event_type='stopped' then stopped:=true; end if;
 end loop;
 update public.demo_medications set plan_version=plan_version+1,updated_at=now() where id=m.id returning * into m;
 return m;
end $$;
revoke all on function private.pilot_impl_demo_medication_event_write(uuid,uuid,uuid,text,numeric,text,text,date,text,integer,uuid,boolean) from public,anon,authenticated;

create function public.demo_medication_register(
 p_tester uuid,p_patient uuid,p_request uuid,p_mode text,p_name text,p_dose numeric,p_unit text,p_frequency text,
 p_started date default null,p_stopped date default null,p_session uuid default null
) returns public.demo_medications language plpgsql security definer set search_path='' as $$
declare m public.demo_medications; payload jsonb; today date:=(now() at time zone 'Europe/Athens')::date;
begin
 perform private.pilot_assert_owner(p_tester);
 if auth.uid() is null then raise exception 'pilot_not_authorized' using errcode='42501'; end if;
 if p_request is null or p_mode is null or p_mode not in ('existing','historical','prescribed')
   or length(trim(coalesce(p_name,''))) not between 1 and 200
   or p_dose is null or p_dose<=0 or p_dose::text in ('NaN','Infinity','-Infinity')
   or length(trim(coalesce(p_unit,''))) not between 1 and 30
   or length(trim(coalesce(p_frequency,''))) not between 1 and 200
   then raise exception 'invalid_medication_registration'; end if;
 if (p_mode='prescribed' and p_started is null)
   or (p_mode<>'prescribed' and (p_started>today or p_session is not null))
   or (p_mode<>'historical' and p_stopped is not null)
   or (p_mode='historical' and (p_stopped>today or p_stopped<p_started))
   then raise exception 'invalid_medication_history'; end if;
 perform 1 from public.demo_patients where id=p_patient and tester_id=p_tester for update;
 if not found then raise exception 'patient_not_found'; end if;
 payload:=jsonb_build_object('mode',p_mode,'name',trim(p_name),'dose',p_dose,'unit',trim(p_unit),
   'frequency',trim(p_frequency),'started_on',p_started,'stopped_on',p_stopped,'session_id',p_session);
 select * into m from public.demo_medications where registration_request_id=p_request;
 if found then
   if m.tester_id<>p_tester or m.patient_id<>p_patient or m.registration_payload is distinct from payload
     then raise exception 'medication_request_conflict'; end if;
   return m;
 end if;
 if p_mode='prescribed' then
   m:=public.demo_medication_start(p_tester,p_patient,p_session,trim(p_name),p_dose,trim(p_unit),trim(p_frequency),p_started,'');
   update public.demo_medications set recorded_by=auth.uid(),registration_request_id=p_request,registration_payload=payload
    where id=m.id returning * into m;
 else
   insert into public.demo_medications(tester_id,patient_id,medication_name,dose,unit,frequency,
     effective_from,started_at,ended_at,status,record_source,recorded_by,registration_request_id,registration_payload)
   values(p_tester,p_patient,trim(p_name),p_dose,trim(p_unit),trim(p_frequency),null,p_started,p_stopped,
     case when p_mode='historical' then 'stopped' else 'active' end,p_mode,auth.uid(),p_request,payload)
   returning * into m;
 end if;
 return m;
end $$;
revoke all on function public.demo_medication_register(uuid,uuid,uuid,text,text,numeric,text,text,date,date,uuid) from public,anon;
grant execute on function public.demo_medication_register(uuid,uuid,uuid,text,text,numeric,text,text,date,date,uuid) to authenticated;
