-- Fictional pilot only: persistent, automatic SMS simulation. No network/provider calls.
alter table public.demo_calendar_events add column sms_reminder_enabled boolean not null default true;
create table private.demo_sms_reminders (
 event_id uuid primary key references public.demo_calendar_events(id) on delete cascade,
 tester_id uuid not null, scheduled_start timestamptz not null, due_at timestamptz not null,
 recipient text not null default '', status text not null check(status in ('queued','simulated','cancelled','missing_phone','expired')),
 message text not null default '', processed_at timestamptz, updated_at timestamptz not null default now()
);
alter table private.demo_sms_reminders enable row level security;
revoke all on private.demo_sms_reminders from public,anon,authenticated;
create index demo_sms_due on private.demo_sms_reminders(due_at) where status='queued';

create function private.demo_sms_sync() returns trigger language plpgsql security definer set search_path=public,private as $$
declare mobile text; state text;
begin
 if new.tester_id is null then return new; end if;
 select regexp_replace(coalesce(phone,''),'[[:space:]()\-]','','g') into mobile from public.demo_patients where id=new.patient_id and tester_id=new.tester_id;
 mobile:=coalesce(mobile,'');
 state:=case when new.status<>'scheduled' or new.session_id is not null or not new.sms_reminder_enabled then 'cancelled'
   when new.scheduled_start<=now() then 'expired'
   when mobile !~ '^(69[0-9]{8}|\+3069[0-9]{8}|003069[0-9]{8}|\+[1-9][0-9]{7,14})$' then 'missing_phone' else 'queued' end;
 insert into private.demo_sms_reminders(event_id,tester_id,scheduled_start,due_at,recipient,status,message)
 values(new.id,new.tester_id,new.scheduled_start,greatest(now(),new.scheduled_start-interval '24 hours'),mobile,state,
   'Υπενθύμιση ραντεβού: '||to_char(new.scheduled_start at time zone 'Europe/Athens','DD/MM/YYYY HH24:MI')||'.')
 on conflict(event_id) do update set scheduled_start=excluded.scheduled_start,
 due_at=case when demo_sms_reminders.scheduled_start=excluded.scheduled_start and demo_sms_reminders.recipient=excluded.recipient and demo_sms_reminders.status in ('queued','simulated') and excluded.status='queued' then demo_sms_reminders.due_at else excluded.due_at end,
 recipient=excluded.recipient,message=excluded.message,
 status=case when demo_sms_reminders.status='simulated' and excluded.status='queued' and demo_sms_reminders.scheduled_start=excluded.scheduled_start and demo_sms_reminders.recipient=excluded.recipient then 'simulated' else excluded.status end,
 processed_at=case when demo_sms_reminders.status='simulated' and excluded.status='queued' and demo_sms_reminders.scheduled_start=excluded.scheduled_start and demo_sms_reminders.recipient=excluded.recipient then demo_sms_reminders.processed_at else null end,
 updated_at=clock_timestamp();
 return new;
end $$;
revoke all on function private.demo_sms_sync() from public,anon,authenticated;
create trigger demo_sms_calendar_sync after insert or update of scheduled_start,status,session_id,sms_reminder_enabled,patient_id on public.demo_calendar_events for each row execute function private.demo_sms_sync();
create function private.demo_sms_phone_sync() returns trigger language plpgsql security definer set search_path=public,private as $$
begin
 if new.phone is distinct from old.phone then update public.demo_calendar_events set sms_reminder_enabled=sms_reminder_enabled where patient_id=new.id and tester_id=new.tester_id and status='scheduled'; end if;
 return new;
end $$;
revoke all on function private.demo_sms_phone_sync() from public,anon,authenticated;
create trigger demo_sms_phone_sync after update of phone on public.demo_patients for each row execute function private.demo_sms_phone_sync();

create function private.process_demo_sms_reminders(p_now timestamptz default now()) returns integer language plpgsql security definer set search_path=public,private as $$
declare item record; job private.demo_sms_reminders; mobile text; processed integer:=0;
begin
 -- Lock appointments before jobs, matching trigger/writer lock order.
 for item in select e.* from public.demo_calendar_events e join private.demo_sms_reminders r on r.event_id=e.id where r.status='queued' and r.due_at<=p_now order by r.due_at limit 100 for update of e skip locked loop
  select * into job from private.demo_sms_reminders where event_id=item.id for update;
  if job.status<>'queued' or job.due_at>p_now then continue; end if;
  select regexp_replace(coalesce(phone,''),'[[:space:]()\-]','','g') into mobile from public.demo_patients where id=item.patient_id and tester_id=item.tester_id;
  update private.demo_sms_reminders set status=case
    when item.status<>'scheduled' or item.session_id is not null or not item.sms_reminder_enabled or item.scheduled_start<>job.scheduled_start then 'cancelled'
    when item.scheduled_start<=p_now then 'expired'
    when mobile is distinct from job.recipient or coalesce(mobile,'') !~ '^(69[0-9]{8}|\+3069[0-9]{8}|003069[0-9]{8}|\+[1-9][0-9]{7,14})$' then 'missing_phone'
    else 'simulated' end,processed_at=p_now,updated_at=clock_timestamp() where event_id=item.id;
  processed:=processed+1;
 end loop;
 return processed;
end $$;
revoke all on function private.process_demo_sms_reminders(timestamptz) from public,anon,authenticated;

create function public.demo_calendar_reminders(p_tester uuid) returns jsonb language sql stable security definer set search_path=public,private as $$
 select coalesce(jsonb_agg(jsonb_build_object('event_id',r.event_id,'status',r.status,'due_at',r.due_at,'processed_at',r.processed_at,'recipient_masked',case when r.recipient='' then '' else '…'||right(r.recipient,4) end,'message',r.message)),'[]'::jsonb) from private.demo_sms_reminders r where r.tester_id=p_tester;
$$;
revoke all on function public.demo_calendar_reminders(uuid) from public;
grant execute on function public.demo_calendar_reminders(uuid) to anon,authenticated;

-- Wrap existing validated writes and reminder preferences in a single transaction.
create function public.demo_calendar_write_sms(p_tester uuid,p_payload jsonb,p_sms boolean default null) returns jsonb language plpgsql security definer set search_path=public,private as $$
declare result jsonb; anchor public.demo_calendar_events; ids uuid[]; act text:=p_payload->>'action'; scope text:=coalesce(p_payload->>'scope','one');
begin
 if p_tester is null or act is null then raise exception 'invalid_calendar_edit'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tester::text,721));
 if act in ('move','cancel','restore') then
  select * into anchor from public.demo_calendar_events where id=(p_payload->>'event_id')::uuid and tester_id=p_tester for update;
  if not found then raise exception 'event_not_found'; end if;
  select array_agg(id) into ids from public.demo_calendar_events where tester_id=p_tester and status=anchor.status and (id=anchor.id or (scope<>'one' and series_id=anchor.series_id and (scope='series' or scheduled_start>=anchor.scheduled_start)));
  result:=public.demo_calendar_edit(p_tester,act,anchor.id,(p_payload->>'expected_updated_at')::timestamptz,(p_payload->>'scheduled_start')::timestamptz,(p_payload->>'scheduled_end')::timestamptz,scope,(p_payload->>'expected_series_updated_at')::timestamptz);
 elsif act='create' and coalesce((p_payload->>'interval_weeks')::integer,0)>0 then
  result:=public.demo_calendar_create_recurring(p_tester,(p_payload->>'patient_id')::uuid,(p_payload->>'scheduled_start')::timestamptz,(p_payload->>'scheduled_end')::timestamptz,coalesce(p_payload->>'appointment_type','follow_up'),(p_payload->>'interval_weeks')::integer,(p_payload->>'occurrences')::integer);
  select array_agg((value->>'id')::uuid) into ids from jsonb_array_elements(result->'events');
 else
  result:=public.demo_calendar_apply_v2(p_tester,act,(p_payload->>'event_id')::uuid,(p_payload->>'patient_id')::uuid,p_payload->>'patient_name',(p_payload->>'scheduled_start')::timestamptz,(p_payload->>'scheduled_end')::timestamptz,coalesce(p_payload->>'appointment_type','follow_up'),coalesce(p_payload->>'detail',''));
  ids:=array[(result->>'id')::uuid];
 end if;
 if p_sms is not null then update public.demo_calendar_events set sms_reminder_enabled=p_sms,updated_at=clock_timestamp() where tester_id=p_tester and id=any(ids) and sms_reminder_enabled is distinct from p_sms; end if;
 if result ? 'events' then
  select jsonb_build_object('series_id',result->'series_id','events',jsonb_agg(to_jsonb(e) order by e.scheduled_start)) into result from public.demo_calendar_events e where e.id=any(ids) and e.tester_id=p_tester;
 else select to_jsonb(e) into result from public.demo_calendar_events e where e.id=(result->>'id')::uuid and e.tester_id=p_tester; end if;
 return result;
end $$;
revoke all on function public.demo_calendar_write_sms(uuid,jsonb,boolean) from public;
grant execute on function public.demo_calendar_write_sms(uuid,jsonb,boolean) to anon,authenticated;

-- Local test engines do not provide pg_cron; hosted Supabase does.
do $cron$
begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  execute 'create extension if not exists pg_cron';
  execute $schedule$select cron.schedule('noima-demo-sms-simulation','* * * * *','select private.process_demo_sms_reminders();')$schedule$;
 end if;
end $cron$;
notify pgrst,'reload schema';
