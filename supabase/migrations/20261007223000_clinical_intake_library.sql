-- Unified patient intake: provisional appointments, tablet/email/print delivery,
-- patient-reported history provenance, and reuse of the existing psychometric score store.

alter table public.demo_calendar_events
  add column if not exists provisional_phone text not null default '',
  add column if not exists provisional_email text not null default '';

create table if not exists private.demo_intake_devices(
  id uuid primary key,
  tester_id uuid not null,
  label text not null check(length(trim(label)) between 1 and 80),
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
alter table private.demo_intake_devices enable row level security;
revoke all on private.demo_intake_devices from public,anon,authenticated;
create index if not exists demo_intake_devices_owner on private.demo_intake_devices(tester_id,active,created_at desc);

create table if not exists private.demo_intakes(
  id uuid primary key,
  tester_id uuid not null,
  appointment_id uuid references public.demo_calendar_events(id),
  patient_id uuid references public.demo_patients(id),
  device_id uuid references private.demo_intake_devices(id),
  tools jsonb not null,
  channel text not null check(channel in ('tablet','email','print','scanned_paper')),
  token_hash text not null unique,
  status text not null default 'assigned' check(status in ('assigned','opened','submitted','conflict','revoked')),
  expires_at timestamptz not null,
  opened_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  identity jsonb,
  history_answers jsonb,
  psychometric_answers jsonb,
  conflict jsonb,
  reviewed_at timestamptz,
  reviewed_by uuid,
  integrated_at timestamptz,
  integration_snapshot jsonb,
  provenance text not null default 'patient_self_report'
);
alter table private.demo_intakes enable row level security;
revoke all on private.demo_intakes from public,anon,authenticated;
create index if not exists demo_intakes_owner on private.demo_intakes(tester_id,created_at desc);
create index if not exists demo_intakes_patient on private.demo_intakes(tester_id,patient_id,created_at desc);
create index if not exists demo_intakes_device on private.demo_intakes(device_id,status,created_at desc);

create table if not exists private.demo_patient_reported_history(
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null unique references private.demo_intakes(id) on delete cascade,
  tester_id uuid not null,
  patient_id uuid not null references public.demo_patients(id) on delete cascade,
  answers jsonb not null,
  source text not null check(source in ('tablet','email','print','scanned_paper')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  integration_snapshot jsonb
);
alter table private.demo_patient_reported_history enable row level security;
revoke all on private.demo_patient_reported_history from public,anon,authenticated;
create index if not exists demo_patient_reported_history_patient on private.demo_patient_reported_history(tester_id,patient_id,submitted_at desc);

create table if not exists private.pilot_intake_mail_deliveries(
  intake_id uuid primary key references private.demo_intakes(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  recipient text not null,
  status text not null check(status in ('claimed','accepted','failed','unknown')),
  provider_id text,
  updated_at timestamptz not null default now()
);
alter table private.pilot_intake_mail_deliveries enable row level security;
revoke all on private.pilot_intake_mail_deliveries from public,anon,authenticated;

alter table private.demo_assessments
  add column if not exists intake_id uuid references private.demo_intakes(id);
create unique index if not exists demo_assessments_intake_instrument
  on private.demo_assessments(intake_id,instrument) where intake_id is not null;

create or replace function private.intake_tools_valid(p_tools jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p_tools)='array'
   and jsonb_array_length(p_tools) between 1 and 3
   and not exists(
     select 1 from jsonb_array_elements(p_tools) x
     where jsonb_typeof(x)<>'string' or trim(x#>>'{}') not in ('history','PHQ-9','GAD-7')
   )
   and (select count(distinct x#>>'{}') from jsonb_array_elements(p_tools) x)=jsonb_array_length(p_tools)
$$;
revoke all on function private.intake_tools_valid(jsonb) from public,anon,authenticated;

create or replace function private.intake_payload_valid(p_value jsonb,p_limit integer)
returns boolean language sql immutable set search_path='' as $$
 select p_value is null or (jsonb_typeof(p_value)='object' and octet_length(p_value::text)<=p_limit)
$$;
revoke all on function private.intake_payload_valid(jsonb,integer) from public,anon,authenticated;

create or replace function private.intake_answers_valid(p_answers jsonb,p_count integer)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p_answers)='array'
   and jsonb_array_length(p_answers)=p_count
   and not exists(
     select 1 from jsonb_array_elements(p_answers) x
     where jsonb_typeof(x)<>'number' or x::text not in ('0','1','2','3')
   )
$$;
revoke all on function private.intake_answers_valid(jsonb,integer) from public,anon,authenticated;

create or replace function private.intake_open_payload(a private.demo_intakes)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare e public.demo_calendar_events; p public.demo_patients; prefill jsonb:='{}'::jsonb;
begin
 if a.patient_id is not null then
   select * into p from public.demo_patients where id=a.patient_id and tester_id=a.tester_id;
   prefill:=jsonb_build_object(
     'first_name',coalesce(p.first_name,''),'last_name',coalesce(p.last_name,''),
     'age',p.reported_age,'phone',coalesce(p.phone,''),'email',coalesce(p.email,''),
     'amka',coalesce(p.amka,''),'address',coalesce(p.address,''),'contact_phone',coalesce(p.contact_phone,'')
   );
 elsif a.appointment_id is not null then
   select * into e from public.demo_calendar_events where id=a.appointment_id and tester_id=a.tester_id;
   prefill:=jsonb_build_object(
     'display_name',coalesce(e.patient_name,''),'phone',coalesce(e.provisional_phone,''),
     'email',coalesce(e.provisional_email,'')
   );
 end if;
 return jsonb_build_object(
   'id',a.id,'status',a.status,'tools',a.tools,'channel',a.channel,
   'expires_at',a.expires_at,'needs_identity',a.patient_id is null,'prefill',prefill
 );
end $$;
revoke all on function private.intake_open_payload(private.demo_intakes) from public,anon,authenticated;

create or replace function private.intake_materialize(a private.demo_intakes,p_patient uuid,p_history jsonb,p_psych jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare answers jsonb; computed integer; version text:='el-demo-2026-10-v1';
begin
 if a.tools ? 'history' and p_history is not null then
   insert into private.demo_patient_reported_history(intake_id,tester_id,patient_id,answers,source,submitted_at)
   values(a.id,a.tester_id,p_patient,p_history,a.channel,now())
   on conflict(intake_id) do nothing;
 end if;

 if a.tools ? 'PHQ-9' then
   answers:=p_psych->'PHQ-9';
   if not private.intake_answers_valid(answers,9) then raise exception 'invalid_phq9'; end if;
   select coalesce(sum((x::text)::integer),0) into computed from jsonb_array_elements(answers) x;
   insert into private.demo_assessments(
     id,tester_id,patient_id,appointment_id,intake_id,instrument,instrument_version,token_hash,
     status,expires_at,opened_at,completed_at,answers,score,item9_review,provenance
   ) values(
     gen_random_uuid(),a.tester_id,p_patient,a.appointment_id,a.id,'PHQ-9',version,
     encode(sha256(convert_to('intake:'||a.id::text||':PHQ-9','UTF8')),'hex'),
     'completed',now(),now(),now(),answers,computed,(answers->>8)::integer>0,
     'patient_intake:'||a.channel||';server_scoring_v1'
   ) on conflict(intake_id,instrument) where intake_id is not null do nothing;
 end if;

 if a.tools ? 'GAD-7' then
   answers:=p_psych->'GAD-7';
   if not private.intake_answers_valid(answers,7) then raise exception 'invalid_gad7'; end if;
   select coalesce(sum((x::text)::integer),0) into computed from jsonb_array_elements(answers) x;
   insert into private.demo_assessments(
     id,tester_id,patient_id,appointment_id,intake_id,instrument,instrument_version,token_hash,
     status,expires_at,opened_at,completed_at,answers,score,item9_review,provenance
   ) values(
     gen_random_uuid(),a.tester_id,p_patient,a.appointment_id,a.id,'GAD-7',version,
     encode(sha256(convert_to('intake:'||a.id::text||':GAD-7','UTF8')),'hex'),
     'completed',now(),now(),now(),answers,computed,false,
     'patient_intake:'||a.channel||';server_scoring_v1'
   ) on conflict(intake_id,instrument) where intake_id is not null do nothing;
 end if;
end $$;
revoke all on function private.intake_materialize(private.demo_intakes,uuid,jsonb,jsonb) from public,anon,authenticated;

create or replace function private.intake_finalize(
  p_intake uuid,p_identity jsonb,p_history jsonb,p_psych jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare a private.demo_intakes; p public.demo_patients; e public.demo_calendar_events; before_event jsonb;
 first_name text; last_name text; phone text; email text; amka text; address text; contact_phone text;
 age integer; candidate public.demo_patients; conflict_data jsonb;
begin
 select * into a from private.demo_intakes where id=p_intake for update;
 if not found or a.status='revoked' then raise exception 'intake_unavailable'; end if;
 if a.status='submitted' then return jsonb_build_object('status','submitted'); end if;
 if a.status='conflict' then return jsonb_build_object('status','conflict'); end if;
 if a.expires_at<=now() then raise exception 'intake_expired'; end if;
 if not private.intake_payload_valid(p_identity,16000)
    or not private.intake_payload_valid(p_history,60000)
    or not private.intake_payload_valid(p_psych,12000) then raise exception 'invalid_intake_payload'; end if;
 if a.tools ? 'history' and (p_history is null or jsonb_typeof(p_history)<>'object') then raise exception 'invalid_history'; end if;
 if p_psych is null then p_psych:='{}'::jsonb; end if;

 if a.patient_id is null then
   if p_identity is null or jsonb_typeof(p_identity)<>'object' then raise exception 'identity_required'; end if;
   first_name:=trim(coalesce(p_identity->>'first_name',''));
   last_name:=trim(coalesce(p_identity->>'last_name',''));
   phone:=trim(coalesce(p_identity->>'phone',''));
   email:=lower(trim(coalesce(p_identity->>'email','')));
   amka:=regexp_replace(coalesce(p_identity->>'amka',''),'[^0-9]','','g');
   address:=trim(coalesce(p_identity->>'address',''));
   contact_phone:=trim(coalesce(p_identity->>'contact_phone',''));
   if first_name='' then raise exception 'identity_required'; end if;
   if amka<>'' and length(amka)<>11 then raise exception 'invalid_amka'; end if;
   begin age:=nullif(trim(coalesce(p_identity->>'age','')),'')::integer; exception when others then raise exception 'invalid_age'; end;
   if age is not null and (age<0 or age>120) then raise exception 'invalid_age'; end if;

   perform pg_advisory_xact_lock(hashtextextended(a.tester_id::text,841));
   if amka<>'' then
     select * into candidate from public.demo_patients where tester_id=a.tester_id and amka=amka limit 1;
     if found then conflict_data:=jsonb_build_object('type','amka','candidate_id',candidate.id); end if;
   end if;
   if conflict_data is null and phone<>'' then
     select * into candidate from public.demo_patients
      where tester_id=a.tester_id and regexp_replace(phone,'[^0-9+]','','g')=regexp_replace(public.demo_patients.phone,'[^0-9+]','','g')
      limit 1;
     if found then conflict_data:=jsonb_build_object('type','possible_match','candidate_id',candidate.id,'matched_on','phone'); end if;
   end if;
   if conflict_data is null and email<>'' then
     select * into candidate from public.demo_patients where tester_id=a.tester_id and lower(email)=lower(public.demo_patients.email) limit 1;
     if found then conflict_data:=jsonb_build_object('type','possible_match','candidate_id',candidate.id,'matched_on','email'); end if;
   end if;

   if conflict_data is not null then
     update private.demo_intakes set status='conflict',identity=p_identity,history_answers=p_history,
       psychometric_answers=p_psych,conflict=conflict_data where id=a.id;
     return jsonb_build_object('status','conflict');
   end if;

   insert into public.demo_patients(
     tester_id,first_name,last_name,reported_age,phone,landline,contact_phone,amka,address,email,chief_complaint
   ) values(
     a.tester_id,first_name,last_name,age,phone,'',contact_phone,amka,address,email,''
   ) returning * into p;
   insert into public.demo_patient_history(patient_id,tester_id) values(p.id,a.tester_id) on conflict(patient_id) do nothing;
   a.patient_id:=p.id;

   if a.appointment_id is not null then
     select * into e from public.demo_calendar_events
       where id=a.appointment_id and tester_id=a.tester_id and status='scheduled' for update;
     if not found or (e.patient_id is not null and e.patient_id<>p.id) then raise exception 'appointment_unavailable'; end if;
     before_event:=to_jsonb(e);
     update public.demo_calendar_events set patient_id=p.id,patient_name=trim(p.first_name||' '||p.last_name),
       provisional_phone='',provisional_email='',readiness='new',readiness_label='Νέος ασθενής · intake ολοκληρώθηκε',
       updated_at=clock_timestamp() where id=e.id returning * into e;
     insert into public.demo_calendar_audit(action,event_id,before_state,after_state)
       values('intake_link',e.id,before_event,to_jsonb(e));
   end if;
 else
   select * into p from public.demo_patients where id=a.patient_id and tester_id=a.tester_id;
   if not found then raise exception 'patient_not_found'; end if;
 end if;

 perform private.intake_materialize(a,p.id,p_history,p_psych);
 update private.demo_intakes set patient_id=p.id,status='submitted',submitted_at=coalesce(submitted_at,now()),
   identity=p_identity,history_answers=p_history,psychometric_answers=p_psych,conflict=null
 where id=a.id;
 return jsonb_build_object('status','submitted');
end $$;
revoke all on function private.intake_finalize(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;

create or replace function private.pilot_impl_demo_calendar_create_provisional_appointment(
 p_tester uuid,p_first_name text,p_last_name text,p_phone text,p_email text,
 p_scheduled_start timestamptz,p_scheduled_end timestamptz,p_appointment_type text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.demo_calendar_events; conflict boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_tester::text,721));
 if length(trim(coalesce(p_first_name,'')))<1 then raise exception 'invalid_patient'; end if;
 if p_scheduled_start is null or p_scheduled_end is null or p_scheduled_end<=p_scheduled_start or p_scheduled_end-p_scheduled_start>interval '24 hours' then raise exception 'valid_start_end_required'; end if;
 if p_appointment_type not in ('initial_assessment','other') then raise exception 'invalid_appointment_type'; end if;
 select exists(select 1 from public.demo_calendar_events x where x.tester_id=p_tester and x.status='scheduled'
   and x.scheduled_start<p_scheduled_end and x.scheduled_end>p_scheduled_start) into conflict;
 if conflict then raise exception 'calendar_conflict'; end if;
 insert into public.demo_calendar_events(
   tester_id,patient_id,patient_name,appointment_type,detail,scheduled_start,scheduled_end,
   readiness,readiness_label,status,provisional_phone,provisional_email,sms_reminder_enabled
 ) values(
   p_tester,null,trim(p_first_name||' '||coalesce(p_last_name,'')),p_appointment_type,'',
   p_scheduled_start,p_scheduled_end,'new','Δεν υπάρχει ακόμη φάκελος','scheduled',
   trim(coalesce(p_phone,'')),lower(trim(coalesce(p_email,''))),false
 ) returning * into e;
 insert into public.demo_calendar_audit(action,event_id,before_state,after_state)
 values('create_provisional',e.id,null,to_jsonb(e));
 return to_jsonb(e);
end $$;
revoke all on function private.pilot_impl_demo_calendar_create_provisional_appointment(uuid,text,text,text,text,timestamptz,timestamptz,text) from public,anon,authenticated;

create or replace function public.demo_calendar_create_provisional_appointment(
 p_tester uuid,p_first_name text,p_last_name text default '',p_phone text default '',p_email text default '',
 p_scheduled_start timestamptz default null,p_scheduled_end timestamptz default null,p_appointment_type text default 'initial_assessment'
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.pilot_assert_owner(p_tester);
 return private.pilot_impl_demo_calendar_create_provisional_appointment(
   p_tester,p_first_name,p_last_name,p_phone,p_email,p_scheduled_start,p_scheduled_end,p_appointment_type
 );
end $$;
revoke all on function public.demo_calendar_create_provisional_appointment(uuid,text,text,text,text,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.demo_calendar_create_provisional_appointment(uuid,text,text,text,text,timestamptz,timestamptz,text) to authenticated;

create or replace function public.demo_intake_device_register(p_tester uuid,p_id uuid,p_token text,p_label text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.demo_intake_devices;
begin
 perform private.pilot_assert_owner(p_tester);
 if p_id is null or length(p_token)<43 or length(trim(coalesce(p_label,''))) not between 1 and 80 then raise exception 'invalid_device'; end if;
 insert into private.demo_intake_devices(id,tester_id,label,token_hash)
 values(p_id,p_tester,trim(p_label),encode(sha256(convert_to(p_token,'UTF8')),'hex'))
 on conflict(id) do nothing;
 select * into d from private.demo_intake_devices where id=p_id;
 if not found or d.tester_id<>p_tester or d.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then raise exception 'device_conflict'; end if;
 return jsonb_build_object('id',d.id,'label',d.label,'active',d.active,'created_at',d.created_at,'last_seen_at',d.last_seen_at);
end $$;
revoke all on function public.demo_intake_device_register(uuid,uuid,text,text) from public,anon;
grant execute on function public.demo_intake_device_register(uuid,uuid,text,text) to authenticated;

create or replace function public.demo_intake_device_list(p_tester uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.pilot_assert_owner(p_tester);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'active',active,'created_at',created_at,'last_seen_at',last_seen_at) order by created_at desc),'[]'::jsonb)
 into result from private.demo_intake_devices where tester_id=p_tester;
 return result;
end $$;
revoke all on function public.demo_intake_device_list(uuid) from public,anon;
grant execute on function public.demo_intake_device_list(uuid) to authenticated;

create or replace function public.demo_intake_device_revoke(p_tester uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.pilot_assert_owner(p_tester);
 update private.demo_intake_devices set active=false where id=p_id and tester_id=p_tester;
 if not found then raise exception 'device_not_found'; end if;
end $$;
revoke all on function public.demo_intake_device_revoke(uuid,uuid) from public,anon;
grant execute on function public.demo_intake_device_revoke(uuid,uuid) to authenticated;

create or replace function public.demo_intake_assign(
 p_tester uuid,p_id uuid,p_token text,p_appointment uuid,p_patient uuid,p_tools jsonb,p_channel text,p_device uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.demo_intakes; e public.demo_calendar_events; resolved_patient uuid:=p_patient; d private.demo_intake_devices;
begin
 perform private.pilot_assert_owner(p_tester);
 if p_id is null or length(p_token)<43 or not private.intake_tools_valid(p_tools) or p_channel not in ('tablet','email','print') then raise exception 'invalid_intake'; end if;
 if p_appointment is null and p_patient is null then raise exception 'intake_subject_required'; end if;
 if p_appointment is not null then
   select * into e from public.demo_calendar_events where id=p_appointment and tester_id=p_tester and status='scheduled';
   if not found then raise exception 'appointment_unavailable'; end if;
   if e.patient_id is not null then
     if resolved_patient is not null and resolved_patient<>e.patient_id then raise exception 'patient_mismatch'; end if;
     resolved_patient:=e.patient_id;
   end if;
 end if;
 if resolved_patient is not null and not exists(select 1 from public.demo_patients where id=resolved_patient and tester_id=p_tester) then raise exception 'patient_not_found'; end if;
 if p_channel='tablet' then
   select * into d from private.demo_intake_devices where id=p_device and tester_id=p_tester and active;
   if not found then raise exception 'device_not_found'; end if;
 elsif p_device is not null then raise exception 'invalid_device'; end if;

 insert into private.demo_intakes(id,tester_id,appointment_id,patient_id,device_id,tools,channel,token_hash,expires_at)
 values(
   p_id,p_tester,p_appointment,resolved_patient,p_device,p_tools,p_channel,
   encode(sha256(convert_to(p_token,'UTF8')),'hex'),
   now()+case when p_channel='tablet' then interval '1 day' when p_channel='email' then interval '14 days' else interval '30 days' end
 ) on conflict(id) do nothing;
 select * into a from private.demo_intakes where id=p_id;
 if not found or a.tester_id<>p_tester or a.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then raise exception 'request_conflict'; end if;
 return to_jsonb(a)-'token_hash'-'identity'-'history_answers'-'psychometric_answers'-'conflict';
end $$;
revoke all on function public.demo_intake_assign(uuid,uuid,text,uuid,uuid,jsonb,text,uuid) from public,anon;
grant execute on function public.demo_intake_assign(uuid,uuid,text,uuid,uuid,jsonb,text,uuid) to authenticated;

create or replace function public.demo_intake_open(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.demo_intakes;
begin
 select * into a from private.demo_intakes where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or a.status='revoked' then raise exception 'intake_unavailable'; end if;
 if a.status='submitted' then return jsonb_build_object('status','submitted'); end if;
 if a.status='conflict' then return jsonb_build_object('status','conflict'); end if;
 if a.expires_at<=now() then raise exception 'intake_expired'; end if;
 update private.demo_intakes set status='opened',opened_at=coalesce(opened_at,now()) where id=a.id;
 a.status:='opened';a.opened_at:=coalesce(a.opened_at,now());
 return private.intake_open_payload(a);
end $$;
revoke all on function public.demo_intake_open(text) from public;
grant execute on function public.demo_intake_open(text) to anon,authenticated;

create or replace function public.demo_intake_submit(p_token text,p_identity jsonb,p_history jsonb,p_psych jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.demo_intakes;
begin
 select * into a from private.demo_intakes where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then raise exception 'intake_unavailable'; end if;
 return private.intake_finalize(a.id,p_identity,p_history,p_psych);
end $$;
revoke all on function public.demo_intake_submit(text,jsonb,jsonb,jsonb) from public;
grant execute on function public.demo_intake_submit(text,jsonb,jsonb,jsonb) to anon,authenticated;

create or replace function public.demo_intake_device_poll(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.demo_intake_devices; a private.demo_intakes;
begin
 select * into d from private.demo_intake_devices where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and active for update;
 if not found then raise exception 'device_unavailable'; end if;
 update private.demo_intake_devices set last_seen_at=now() where id=d.id;
 select * into a from private.demo_intakes
   where device_id=d.id and tester_id=d.tester_id and channel='tablet' and status in ('assigned','opened')
     and expires_at>now() order by created_at desc limit 1 for update;
 if not found then return jsonb_build_object('status','waiting','device_label',d.label); end if;
 update private.demo_intakes set status='opened',opened_at=coalesce(opened_at,now()) where id=a.id;
 a.status:='opened';a.opened_at:=coalesce(a.opened_at,now());
 return private.intake_open_payload(a)||jsonb_build_object('device_label',d.label);
end $$;
revoke all on function public.demo_intake_device_poll(text) from public;
grant execute on function public.demo_intake_device_poll(text) to anon,authenticated;

create or replace function public.demo_intake_device_submit(p_device_token text,p_intake uuid,p_identity jsonb,p_history jsonb,p_psych jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.demo_intake_devices; a private.demo_intakes;
begin
 select * into d from private.demo_intake_devices where token_hash=encode(sha256(convert_to(p_device_token,'UTF8')),'hex') and active;
 if not found then raise exception 'device_unavailable'; end if;
 select * into a from private.demo_intakes where id=p_intake and device_id=d.id and tester_id=d.tester_id and channel='tablet';
 if not found then raise exception 'intake_unavailable'; end if;
 return private.intake_finalize(a.id,p_identity,p_history,p_psych);
end $$;
revoke all on function public.demo_intake_device_submit(text,uuid,jsonb,jsonb,jsonb) from public;
grant execute on function public.demo_intake_device_submit(text,uuid,jsonb,jsonb,jsonb) to anon,authenticated;

create or replace function public.demo_intake_list(p_tester uuid,p_patient uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.pilot_assert_owner(p_tester);
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'appointment_id',a.appointment_id,'patient_id',a.patient_id,'tools',a.tools,'channel',a.channel,
   'device_id',a.device_id,'status',a.status,'expires_at',a.expires_at,'opened_at',a.opened_at,
   'submitted_at',a.submitted_at,'created_at',a.created_at,'identity',a.identity,'history_answers',a.history_answers,
   'conflict',case when a.conflict is null then null else a.conflict-'candidate_id' end,
   'reviewed_at',a.reviewed_at,'integrated_at',a.integrated_at,
   'patient_name',coalesce(trim(concat_ws(' ',p.first_name,p.last_name)),e.patient_name,'')
 ) order by a.created_at desc),'[]'::jsonb) into result
 from private.demo_intakes a
 left join public.demo_patients p on p.id=a.patient_id and p.tester_id=a.tester_id
 left join public.demo_calendar_events e on e.id=a.appointment_id and e.tester_id=a.tester_id
 where a.tester_id=p_tester and (p_patient is null or a.patient_id=p_patient);
 return result;
end $$;
revoke all on function public.demo_intake_list(uuid,uuid) from public,anon;
grant execute on function public.demo_intake_list(uuid,uuid) to authenticated;

create or replace function public.demo_intake_revoke(p_tester uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.pilot_assert_owner(p_tester);
 update private.demo_intakes set status='revoked' where id=p_id and tester_id=p_tester and status in ('assigned','opened');
 if not found then raise exception 'intake_unavailable'; end if;
end $$;
revoke all on function public.demo_intake_revoke(uuid,uuid) from public,anon;
grant execute on function public.demo_intake_revoke(uuid,uuid) to authenticated;

create or replace function public.demo_intake_resolve(p_tester uuid,p_id uuid,p_patient uuid default null,p_create_new boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.demo_intakes; p public.demo_patients; e public.demo_calendar_events; before_event jsonb;
 first_name text;last_name text;phone text;email text;amka text;address text;contact_phone text;age integer;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into a from private.demo_intakes where id=p_id and tester_id=p_tester and status='conflict' for update;
 if not found then raise exception 'intake_conflict_unavailable'; end if;
 if (p_patient is null)=(not p_create_new) then raise exception 'resolution_required'; end if;

 if p_patient is not null then
   select * into p from public.demo_patients where id=p_patient and tester_id=p_tester;
   if not found then raise exception 'patient_not_found'; end if;
 else
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

create or replace function public.demo_intake_review(
 p_tester uuid,p_id uuid,p_patch jsonb,p_expected_history_version integer
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.demo_intakes; h public.demo_patient_history; before_history jsonb; after_history jsonb; k text; v jsonb;
 allowed constant text[]:=array['psychiatric_history','medical_history','previous_treatments','hospitalizations','family_history','substance_history','social_functioning','allergies'];
begin
 perform private.pilot_assert_owner(p_tester);
 select * into a from private.demo_intakes where id=p_id and tester_id=p_tester and status='submitted' for update;
 if not found or a.patient_id is null or not(a.tools ? 'history') then raise exception 'intake_review_unavailable'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>50000 then raise exception 'invalid_history_patch'; end if;
 for k,v in select * from jsonb_each(p_patch) loop
   if not(k=any(allowed)) or jsonb_typeof(v)<>'string' or length(v#>>'{}')>8000 then raise exception 'invalid_history_patch'; end if;
 end loop;
 select * into h from public.demo_patient_history where patient_id=a.patient_id and tester_id=p_tester for update;
 if not found then raise exception 'history_not_found'; end if;
 if p_expected_history_version is null or h.version<>p_expected_history_version then raise exception 'stale_history'; end if;
 before_history:=to_jsonb(h);
 update public.demo_patient_history set
   psychiatric_history=case when p_patch ? 'psychiatric_history' then p_patch->>'psychiatric_history' else psychiatric_history end,
   medical_history=case when p_patch ? 'medical_history' then p_patch->>'medical_history' else medical_history end,
   previous_treatments=case when p_patch ? 'previous_treatments' then p_patch->>'previous_treatments' else previous_treatments end,
   hospitalizations=case when p_patch ? 'hospitalizations' then p_patch->>'hospitalizations' else hospitalizations end,
   family_history=case when p_patch ? 'family_history' then p_patch->>'family_history' else family_history end,
   substance_history=case when p_patch ? 'substance_history' then p_patch->>'substance_history' else substance_history end,
   social_functioning=case when p_patch ? 'social_functioning' then p_patch->>'social_functioning' else social_functioning end,
   allergies=case when p_patch ? 'allergies' then p_patch->>'allergies' else allergies end,
   version=version+1,updated_at=now()
 where patient_id=a.patient_id returning to_jsonb(demo_patient_history.*) into after_history;
 update private.demo_intakes set reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,auth.uid()),
   integrated_at=case when p_patch<>'{}'::jsonb then coalesce(integrated_at,now()) else integrated_at end,
   integration_snapshot=jsonb_build_object('before',before_history,'patch',p_patch,'after',after_history)
 where id=a.id;
 update private.demo_patient_reported_history set reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,auth.uid()),
   integration_snapshot=jsonb_build_object('before',before_history,'patch',p_patch,'after',after_history)
 where intake_id=a.id;
 return after_history;
end $$;
revoke all on function public.demo_intake_review(uuid,uuid,jsonb,integer) from public,anon;
grant execute on function public.demo_intake_review(uuid,uuid,jsonb,integer) to authenticated;

create or replace function public.pilot_intake_mail_claim(p_intake uuid,p_token text,p_recipient text)
returns text language plpgsql security definer set search_path='' as $$
declare a private.demo_intakes; existing private.pilot_intake_mail_deliveries;
begin
 select * into a from private.demo_intakes where id=p_intake for update;
 if not found or not private.pilot_owns(a.tester_id)
   or a.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex')
   or a.channel<>'email' or a.status not in ('assigned','opened') or a.expires_at<=now()
 then raise exception 'intake_unavailable'; end if;
 if length(p_recipient) not between 3 and 254 then raise exception 'invalid_recipient'; end if;
 select * into existing from private.pilot_intake_mail_deliveries where intake_id=p_intake;
 if found and existing.status<>'failed' then return existing.status; end if;
 insert into private.pilot_intake_mail_deliveries(intake_id,user_id,recipient,status)
 values(p_intake,auth.uid(),p_recipient,'claimed')
 on conflict(intake_id) do update set user_id=excluded.user_id,recipient=excluded.recipient,status='claimed',updated_at=now();
 return 'new';
end $$;
revoke all on function public.pilot_intake_mail_claim(uuid,text,text) from public,anon;
grant execute on function public.pilot_intake_mail_claim(uuid,text,text) to authenticated;

create or replace function public.pilot_intake_mail_finish(p_intake uuid,p_status text,p_provider_id text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if public.pilot_identity() is null or p_status not in ('accepted','failed','unknown') then raise exception 'not_authorized'; end if;
 update private.pilot_intake_mail_deliveries set status=p_status,provider_id=p_provider_id,updated_at=now()
 where intake_id=p_intake and user_id=auth.uid() and status='claimed';
 if not found then raise exception 'delivery_unavailable'; end if;
end $$;
revoke all on function public.pilot_intake_mail_finish(uuid,text,text) from public,anon;
grant execute on function public.pilot_intake_mail_finish(uuid,text,text) to authenticated;

create or replace function public.demo_overview_state(p_tester uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
 perform private.pilot_assert_owner(p_tester);
 select jsonb_build_object(
   'events',coalesce((select jsonb_agg(to_jsonb(e)-'tester_id' order by e.scheduled_start)
     from public.demo_calendar_events e where e.tester_id=p_tester),'[]'::jsonb),
   'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.due_at nulls last,t.created_at desc)
     from public.demo_tasks t where t.tester_id=p_tester and t.status='open'),'[]'::jsonb),
   'psychometrics',coalesce((select jsonb_agg(jsonb_build_object(
     'id',a.id,'patient_id',a.patient_id,'patient_name',trim(concat_ws(' ',p.first_name,p.last_name)),
     'instrument',a.instrument,'status',a.status,'score',a.score,'completed_at',a.completed_at,
     'created_at',a.created_at,'reviewed_at',a.reviewed_at,'item9_review',a.item9_review,'item9_reviewed_at',a.item9_reviewed_at
   ) order by coalesce(a.completed_at,a.created_at) desc)
     from private.demo_assessments a join public.demo_patients p on p.id=a.patient_id and p.tester_id=a.tester_id
     where a.tester_id=p_tester and a.status='completed'
       and (a.reviewed_at is null or (a.item9_review and a.item9_reviewed_at is null))),'[]'::jsonb),
   'intakes',coalesce((select jsonb_agg(jsonb_build_object(
     'id',i.id,'patient_id',i.patient_id,'patient_name',coalesce(trim(concat_ws(' ',p.first_name,p.last_name)),e.patient_name,''),
     'tools',i.tools,'channel',i.channel,'status',i.status,'submitted_at',i.submitted_at,'created_at',i.created_at
   ) order by coalesce(i.submitted_at,i.created_at) desc)
     from private.demo_intakes i
     left join public.demo_patients p on p.id=i.patient_id and p.tester_id=i.tester_id
     left join public.demo_calendar_events e on e.id=i.appointment_id and e.tester_id=i.tester_id
     where i.tester_id=p_tester and ((i.status='submitted' and i.tools ? 'history' and i.reviewed_at is null) or i.status='conflict')
   ),'[]'::jsonb)
 ) into payload;
 return payload;
end $$;
revoke all on function public.demo_overview_state(uuid) from public,anon;
grant execute on function public.demo_overview_state(uuid) to authenticated;

notify pgrst,'reload schema';
