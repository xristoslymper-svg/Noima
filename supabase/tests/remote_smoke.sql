-- Run with an administrative SQL connection. Everything is rolled back, including
-- temporary Auth users. No email/password provisioning and no external requests.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
  patient_a uuid := gen_random_uuid(); patient_b uuid := gen_random_uuid();
begin
  insert into auth.users(id) values(a),(b);
  insert into public.profiles(id,full_name) values(a,'QA A'),(b,'QA B');
  insert into public.practices(id,name) values(pa,'Rollback QA A'),(pb,'Rollback QA B');
  insert into public.practice_members(practice_id,user_id,role) values(pa,a,'owner'),(pb,b,'owner');
  insert into public.patients(id,practice_id,first_name,created_by) values(patient_a,pa,'QA A',a),(patient_b,pb,'QA B',b);
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('noima.qa_practice',pa::text,true);
  perform set_config('noima.qa_other_practice',pb::text,true);
  perform set_config('noima.qa_patient',patient_a::text,true);
  perform set_config('noima.qa_other_patient',patient_b::text,true);
end $$;
set local role authenticated;
do $$
declare pa uuid := current_setting('noima.qa_practice')::uuid;
  pb uuid := current_setting('noima.qa_other_practice')::uuid;
  patient_a uuid := current_setting('noima.qa_patient')::uuid;
  patient_b uuid := current_setting('noima.qa_other_patient')::uuid;
  s uuid; sec uuid; k text; denied boolean := false;
begin
  if not exists(select 1 from public.patients where id=patient_a) then raise exception 'Own patient missing'; end if;
  if exists(select 1 from public.patients where id=patient_b) then raise exception 'Cross-tenant read allowed'; end if;
  begin
    insert into public.patients(practice_id,first_name) values(pb,'Forbidden');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Cross-tenant insert allowed'; end if;
  insert into public.clinical_sessions(patient_id,practice_id,session_type,scheduled_at)
    values(patient_a,pa,'initial_assessment',now()) returning id into s;
  for k in select unnest(array['psychiatric_interview','mse','risk_assessment','clinical_assessment','treatment_plan','next_review']) loop
    insert into public.session_sections(session_id,patient_id,practice_id,section_type,content)
      values(s,patient_a,pa,k::public.section_type,'Temporary QA content') returning id into sec;
    perform public.approve_clinical_section(sec,1);
  end loop;
  insert into public.risk_assessments(session_id,patient_id,practice_id,suicidal_ideation) values(s,patient_a,pa,false);
  if not exists(select 1 from public.risk_assessments where session_id=s and suicidal_ideation=false and intent is null) then raise exception 'NULL risk corrupted'; end if;
  perform public.complete_clinical_session(s,1);
  if not exists(select 1 from public.clinical_sessions where id=s and status='completed') then raise exception 'Completion failed'; end if;
  denied := false;
  begin update public.clinical_sessions set started_at=now() where id=s;
  exception when raise_exception then
    if SQLERRM = 'Completed session is immutable' then denied := true; else raise; end if;
  end;
  if not denied then raise exception 'Completed session was modified'; end if;
  if not exists(select 1 from public.audit_events where entity_id=s and event_type='session_completed' and actor_user_id=auth.uid()) then raise exception 'Completion audit missing'; end if;
  denied := false;
  begin perform 1 from private.assessment_invitations;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Invitation table exposed'; end if;
end $$;
set local role anon;
do $$ declare denied boolean := false;
begin
  begin perform 1 from public.patients;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Anonymous patient read allowed'; end if;
end $$;
rollback;
select 'PASS: tenant isolation, approval, completion, immutability, nullable risk, audit, anonymous denial; all fixtures rolled back' as result;
