-- Fix runtime identity matching ambiguity discovered by transactional acceptance testing.
create or replace function private.intake_finalize(
  p_intake uuid,p_identity jsonb,p_history jsonb,p_psych jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $intake_fix$
<<intake_identity_match>>
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
     select dp.* into candidate from public.demo_patients dp where dp.tester_id=a.tester_id and dp.amka=intake_identity_match.amka limit 1;
     if found then conflict_data:=jsonb_build_object('type','amka','candidate_id',candidate.id); end if;
   end if;
   if conflict_data is null and phone<>'' then
     select dp.* into candidate from public.demo_patients dp
      where dp.tester_id=a.tester_id and regexp_replace(intake_identity_match.phone,'[^0-9+]','','g')=regexp_replace(dp.phone,'[^0-9+]','','g')
      limit 1;
     if found then conflict_data:=jsonb_build_object('type','possible_match','candidate_id',candidate.id,'matched_on','phone'); end if;
   end if;
   if conflict_data is null and email<>'' then
     select dp.* into candidate from public.demo_patients dp where dp.tester_id=a.tester_id and lower(intake_identity_match.email)=lower(dp.email) limit 1;
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
end $intake_fix$;
revoke all on function private.intake_finalize(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
