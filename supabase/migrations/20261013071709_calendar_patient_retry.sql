-- One transaction and a caller-held event UUID make lost-response retries safe.
-- No new tables or columns: the event primary key is the idempotency key.
create function private.calendar_create_patient_retry(
 p_tester uuid,p_request uuid,p_first_name text,p_last_name text,p_phone text,p_email text,
 p_start timestamptz,p_end timestamptz,p_type text,p_sms boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.demo_patients; e public.demo_calendar_events;
begin
 perform private.pilot_assert_owner(p_tester);
 if p_tester is null or p_request is null then raise exception 'invalid_request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tester::text,721));
 select * into e from public.demo_calendar_events where id=p_request;
 if e.id is not null then
  if e.tester_id<>p_tester then raise exception 'request_conflict'; end if;
  select * into p from public.demo_patients where id=e.patient_id and tester_id=p_tester;
  if p.id is null or p.first_name is distinct from trim(p_first_name) or p.last_name is distinct from trim(p_last_name)
   or p.phone is distinct from trim(p_phone) or p.email is distinct from trim(p_email)
   or e.scheduled_start is distinct from p_start or e.scheduled_end is distinct from p_end
   or e.appointment_type is distinct from p_type or e.sms_reminder_enabled is distinct from p_sms
   then raise exception 'request_conflict'; end if;
  return jsonb_build_object('patient',to_jsonb(p),'event',to_jsonb(e));
 end if;
 if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '24 hours' then raise exception 'valid_start_end_required'; end if;
 if p_type is null or p_type not in ('initial_assessment','follow_up','other') or p_sms is null then raise exception 'invalid_request'; end if;
 if exists(select 1 from public.demo_calendar_events where tester_id=p_tester and status='scheduled' and scheduled_start<p_end and scheduled_end>p_start) then raise exception 'calendar_conflict'; end if;
 p:=public.demo_patient_create_v3(p_tester,p_first_name,p_last_name,null,p_phone,'','','','',p_email,'');
 insert into public.demo_calendar_events(id,tester_id,patient_id,patient_name,appointment_type,detail,scheduled_start,scheduled_end,readiness,readiness_label,status,sms_reminder_enabled)
 values(p_request,p_tester,p.id,trim(p.first_name||' '||p.last_name),p_type,'',p_start,p_end,'new','Νέος ασθενής','scheduled',p_sms) returning * into e;
 insert into public.demo_calendar_audit(action,event_id,before_state,after_state) values('create',e.id,null,to_jsonb(e));
 return jsonb_build_object('patient',to_jsonb(p),'event',to_jsonb(e));
end $$;
revoke all on function private.calendar_create_patient_retry(uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,boolean) from public,anon;
grant execute on function private.calendar_create_patient_retry(uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,boolean) to authenticated;
create function public.demo_calendar_create_patient_retry(p_tester uuid,p_request uuid,p_first_name text,p_last_name text,p_phone text,p_email text,p_start timestamptz,p_end timestamptz,p_type text,p_sms boolean)
returns jsonb language sql security invoker set search_path='' as $$
 select private.calendar_create_patient_retry(p_tester,p_request,p_first_name,p_last_name,p_phone,p_email,p_start,p_end,p_type,p_sms);
$$;
revoke all on function public.demo_calendar_create_patient_retry(uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,boolean) from public,anon;
grant execute on function public.demo_calendar_create_patient_retry(uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,boolean) to authenticated;
