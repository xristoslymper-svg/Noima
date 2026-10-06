-- Patient-folder journey integrity: consistent drafts, names, and correction concurrency.
create or replace function private.pilot_impl_demo_session_start(p_tester uuid,p_patient uuid,p_type text)
returns public.demo_sessions
language plpgsql security definer set search_path='public'
as $$
declare r public.demo_sessions;
begin
 if p_type is null or p_type not in ('initial_assessment','follow_up') then raise exception 'invalid_session_type'; end if;
 perform 1 from public.demo_patients where id=p_patient and tester_id=p_tester for update;
 if not found then raise exception 'patient_not_found'; end if;
 select * into r from public.demo_sessions
 where patient_id=p_patient and tester_id=p_tester and status='draft'
 order by created_at desc limit 1 for update;
 if r.id is not null then
   if r.session_type<>p_type then raise exception 'open_draft_conflict'; end if;
   return r;
 end if;
 insert into public.demo_sessions(tester_id,patient_id,session_type) values(p_tester,p_patient,p_type) returning * into r;
 return r;
end $$;

create or replace function private.pilot_impl_demo_patient_update_v2(
 p_tester uuid,p_patient uuid,p_first_name text,p_last_name text default '',p_age integer default null,
 p_phone text default '',p_landline text default '',p_contact_phone text default '',p_amka text default '',
 p_address text default '',p_email text default '',p_complaint text default '',p_expected_updated_at timestamptz default null
) returns public.demo_patients
language plpgsql security definer set search_path='public'
as $$
declare r public.demo_patients; display_name text;
begin
 if length(trim(coalesce(p_first_name,'')))<1 then raise exception 'invalid_patient'; end if;
 if p_age is not null and (p_age<0 or p_age>120) then raise exception 'invalid_patient'; end if;
 if length(regexp_replace(coalesce(p_amka,''),'[^0-9]','','g')) not in (0,11) then raise exception 'invalid_patient'; end if;
 update public.demo_patients
 set first_name=trim(p_first_name),last_name=trim(coalesce(p_last_name,'')),reported_age=p_age,
     phone=trim(coalesce(p_phone,'')),landline=trim(coalesce(p_landline,'')),contact_phone=trim(coalesce(p_contact_phone,'')),
     amka=regexp_replace(coalesce(p_amka,''),'[^0-9]','','g'),address=trim(coalesce(p_address,'')),
     email=trim(coalesce(p_email,'')),chief_complaint=trim(coalesce(p_complaint,'')),updated_at=now()
 where id=p_patient and tester_id=p_tester and (p_expected_updated_at is null or updated_at=p_expected_updated_at)
 returning * into r;
 if r.id is null then
   if exists(select 1 from public.demo_patients where id=p_patient and tester_id=p_tester) then raise exception 'stale_patient'; end if;
   raise exception 'patient_not_found';
 end if;
 display_name:=trim(concat_ws(' ',r.first_name,r.last_name));
 update public.demo_calendar_events set patient_name=display_name,updated_at=now()
 where tester_id=p_tester and patient_id=p_patient and patient_name is distinct from display_name;
 update public.demo_tasks t
 set title='Ολοκλήρωση καταγραφής · '||display_name,updated_at=now()
 where t.tester_id=p_tester and t.patient_id=p_patient and t.status='open' and t.source_session_id is not null;
 return r;
end $$;

create or replace function private.pilot_impl_demo_session_correction_create_v2(
 p_tester uuid,p_session uuid,p_request uuid,p_reason text,p_patch jsonb,p_expected_count integer
) returns public.demo_session_corrections
language plpgsql security definer set search_path='public','private'
as $$
declare s public.demo_sessions; existing public.demo_session_corrections; current_count integer;
begin
 select * into existing from public.demo_session_corrections where request_id=p_request;
 if found then
   if existing.tester_id<>p_tester or existing.session_id<>p_session or existing.reason<>trim(p_reason) or existing.patch<>p_patch then
     raise exception 'request_conflict';
   end if;
   return existing;
 end if;
 select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
 if not found or s.status<>'completed' then raise exception 'completed_session_required'; end if;
 select count(*)::int into current_count from public.demo_session_corrections where tester_id=p_tester and session_id=p_session;
 if p_expected_count is null or p_expected_count<>current_count then raise exception 'stale_correction'; end if;
 return private.pilot_impl_demo_session_correction_create(p_tester,p_session,p_request,p_reason,p_patch);
end $$;
revoke all on function private.pilot_impl_demo_session_correction_create_v2(uuid,uuid,uuid,text,jsonb,integer) from public,anon,authenticated;

create or replace function public.demo_session_correction_create_v2(
 p_tester uuid,p_session uuid,p_request uuid,p_reason text,p_patch jsonb,p_expected_count integer
) returns public.demo_session_corrections
language plpgsql security definer set search_path=''
as $$
begin
 perform private.pilot_assert_owner(p_tester);
 return private.pilot_impl_demo_session_correction_create_v2(p_tester,p_session,p_request,p_reason,p_patch,p_expected_count);
end $$;
revoke all on function public.demo_session_correction_create_v2(uuid,uuid,uuid,text,jsonb,integer) from public,anon;
grant execute on function public.demo_session_correction_create_v2(uuid,uuid,uuid,text,jsonb,integer) to authenticated;
