-- CI-only PostgreSQL fixture. NEVER deploy this file.
create role anon;create role authenticated;create schema auth;create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.pilot_identity() returns jsonb language sql stable as $$select jsonb_build_object('workspace_id',current_setting('test.workspace',true))$$;
create function private.pilot_assert_owner(w uuid) returns void language plpgsql as $$begin if w::text is distinct from current_setting('test.workspace',true) then raise exception 'not_owner';end if;end$$;
create table public.demo_patients(id uuid primary key default gen_random_uuid(),tester_id uuid,first_name text,last_name text,phone text,email text);
create table public.demo_calendar_events(id uuid primary key default gen_random_uuid(),tester_id uuid,patient_id uuid,scheduled_start timestamptz,scheduled_end timestamptz,status text default 'scheduled');
create function public.demo_calendar_write_sms(p_tester uuid,p_payload jsonb,p_sms boolean) returns jsonb language plpgsql as $$
declare e public.demo_calendar_events;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_tester::text,721));
 if exists(select 1 from public.demo_calendar_events where tester_id=p_tester and status<>'cancelled' and scheduled_start<(p_payload->>'scheduled_end')::timestamptz and scheduled_end>(p_payload->>'scheduled_start')::timestamptz) then raise exception 'calendar_conflict';end if;
 insert into public.demo_calendar_events(tester_id,patient_id,scheduled_start,scheduled_end) values(p_tester,(p_payload->>'patient_id')::uuid,(p_payload->>'scheduled_start')::timestamptz,(p_payload->>'scheduled_end')::timestamptz) returning * into e;return to_jsonb(e);
end$$;
create function public.demo_calendar_create_patient_retry(p_tester uuid,p_request uuid,p_first_name text,p_last_name text,p_phone text,p_email text,p_start timestamptz,p_end timestamptz,p_type text,p_sms boolean)
returns jsonb language plpgsql as $$
declare pid uuid;e jsonb;
begin
 insert into public.demo_patients(tester_id,first_name,last_name,phone,email) values(p_tester,p_first_name,p_last_name,p_phone,p_email) returning id into pid;
 e:=public.demo_calendar_write_sms(p_tester,jsonb_build_object('patient_id',pid,'scheduled_start',p_start,'scheduled_end',p_end),p_sms);
 return jsonb_build_object('patient',jsonb_build_object('id',pid),'event',e);
end$$;
