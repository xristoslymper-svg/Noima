-- Allow sending intake tools to a new patient before a patient folder or appointment exists.
-- Keep the assignment atomic, prefill only minimal identity, and expose intake lineage to the review inbox.

create or replace function public.demo_intake_assign_unattached(
 p_tester uuid,p_id uuid,p_token text,p_identity jsonb,p_tools jsonb,p_channel text,p_device uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $unattached$
declare
 a private.demo_intakes;
 d private.demo_intake_devices;
 first_name text;
 last_name text;
 email text;
begin
 perform private.pilot_assert_owner(p_tester);
 if p_id is null or length(p_token)<43 or not private.intake_tools_valid(p_tools) or p_channel not in ('tablet','email','print') then
   raise exception 'invalid_intake';
 end if;
 if p_identity is null or jsonb_typeof(p_identity)<>'object' or octet_length(p_identity::text)>4000 then
   raise exception 'invalid_identity';
 end if;

 first_name:=trim(coalesce(p_identity->>'first_name',''));
 last_name:=trim(coalesce(p_identity->>'last_name',''));
 email:=lower(trim(coalesce(p_identity->>'email','')));
 if length(first_name) not between 1 and 120 or length(last_name)>120 or length(email)>254 then
   raise exception 'invalid_identity';
 end if;

 if p_channel='tablet' then
   select * into d from private.demo_intake_devices where id=p_device and tester_id=p_tester and active;
   if not found then raise exception 'device_not_found'; end if;
 elsif p_device is not null then
   raise exception 'invalid_device';
 end if;

 insert into private.demo_intakes(
   id,tester_id,appointment_id,patient_id,device_id,tools,channel,token_hash,expires_at,identity
 ) values(
   p_id,p_tester,null,null,p_device,p_tools,p_channel,
   encode(sha256(convert_to(p_token,'UTF8')),'hex'),
   now()+case when p_channel='tablet' then interval '1 day' when p_channel='email' then interval '14 days' else interval '30 days' end,
   jsonb_build_object('first_name',first_name,'last_name',last_name,'email',email)
 ) on conflict(id) do nothing;

 select * into a from private.demo_intakes where id=p_id;
 if not found or a.tester_id<>p_tester or a.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then
   raise exception 'request_conflict';
 end if;
 return to_jsonb(a)-'token_hash'-'identity'-'history_answers'-'psychometric_answers'-'conflict';
end
$unattached$;
revoke all on function public.demo_intake_assign_unattached(uuid,uuid,text,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.demo_intake_assign_unattached(uuid,uuid,text,jsonb,jsonb,text,uuid) to authenticated;

create or replace function private.intake_open_payload(a private.demo_intakes)
returns jsonb
language plpgsql
security definer
set search_path=''
as $open_payload$
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
 else
   prefill:=coalesce(a.identity,'{}'::jsonb);
 end if;
 return jsonb_build_object(
   'id',a.id,'status',a.status,'tools',a.tools,'channel',a.channel,
   'expires_at',a.expires_at,'needs_identity',a.patient_id is null,'prefill',prefill
 );
end
$open_payload$;
revoke all on function private.intake_open_payload(private.demo_intakes) from public,anon,authenticated;

create or replace function public.demo_intake_list(p_tester uuid,p_patient uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $intake_list$
declare result jsonb;
begin
 perform private.pilot_assert_owner(p_tester);
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'appointment_id',a.appointment_id,'patient_id',a.patient_id,'tools',a.tools,'channel',a.channel,
   'device_id',a.device_id,'status',a.status,'expires_at',a.expires_at,'opened_at',a.opened_at,
   'submitted_at',a.submitted_at,'created_at',a.created_at,'identity',a.identity,'history_answers',a.history_answers,
   'conflict',case when a.conflict is null then null else a.conflict-'candidate_id' end,
   'reviewed_at',a.reviewed_at,'integrated_at',a.integrated_at,
   'patient_name',coalesce(
     nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
     nullif(e.patient_name,''),
     nullif(trim(concat_ws(' ',a.identity->>'first_name',a.identity->>'last_name')),''),
     ''
   )
 ) order by a.created_at desc),'[]'::jsonb) into result
 from private.demo_intakes a
 left join public.demo_patients p on p.id=a.patient_id and p.tester_id=a.tester_id
 left join public.demo_calendar_events e on e.id=a.appointment_id and e.tester_id=a.tester_id
 where a.tester_id=p_tester and (p_patient is null or a.patient_id=p_patient);
 return result;
end
$intake_list$;
revoke all on function public.demo_intake_list(uuid,uuid) from public,anon;
grant execute on function public.demo_intake_list(uuid,uuid) to authenticated;

create or replace function public.demo_overview_state(p_tester uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $overview$
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
     'created_at',a.created_at,'reviewed_at',a.reviewed_at,'item9_review',a.item9_review,'item9_reviewed_at',a.item9_reviewed_at,
     'intake_id',a.intake_id,'provenance',a.provenance
   ) order by coalesce(a.completed_at,a.created_at) desc)
     from private.demo_assessments a join public.demo_patients p on p.id=a.patient_id and p.tester_id=a.tester_id
     where a.tester_id=p_tester and a.status='completed'
       and (a.reviewed_at is null or (a.item9_review and a.item9_reviewed_at is null))),'[]'::jsonb),
   'intakes',coalesce((select jsonb_agg(jsonb_build_object(
     'id',i.id,'patient_id',i.patient_id,
     'patient_name',coalesce(
       nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
       nullif(e.patient_name,''),
       nullif(trim(concat_ws(' ',i.identity->>'first_name',i.identity->>'last_name')),''),
       ''
     ),
     'tools',i.tools,'channel',i.channel,'status',i.status,'submitted_at',i.submitted_at,'created_at',i.created_at
   ) order by coalesce(i.submitted_at,i.created_at) desc)
     from private.demo_intakes i
     left join public.demo_patients p on p.id=i.patient_id and p.tester_id=i.tester_id
     left join public.demo_calendar_events e on e.id=i.appointment_id and e.tester_id=i.tester_id
     where i.tester_id=p_tester and ((i.status='submitted' and i.tools ? 'history' and i.reviewed_at is null) or i.status='conflict')
   ),'[]'::jsonb)
 ) into payload;
 return payload;
end
$overview$;
revoke all on function public.demo_overview_state(uuid) from public,anon;
grant execute on function public.demo_overview_state(uuid) to authenticated;

notify pgrst,'reload schema';
