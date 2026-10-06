-- Tie "finish later" work items to the exact draft session.
alter table public.demo_tasks
  add column if not exists source_session_id uuid null references public.demo_sessions(id) on delete cascade;

create unique index if not exists demo_tasks_open_session_uq
  on public.demo_tasks(tester_id,source_session_id)
  where source_session_id is not null and status='open';

drop function if exists public.demo_task_for_session(uuid,uuid,uuid,text);
drop function if exists public.demo_session_owned(uuid,uuid);

create or replace function private.pilot_impl_demo_task_for_session(
  p_tester uuid,
  p_session uuid
)
returns public.demo_tasks
language plpgsql
security definer
set search_path=public,private
as $$
declare
  s public.demo_sessions;
  p public.demo_patients;
  t public.demo_tasks;
  task_title text;
begin
  select * into s
  from public.demo_sessions
  where id=p_session and tester_id=p_tester
  for update;
  if not found or s.status<>'draft' then raise exception 'session_unavailable'; end if;

  select * into p
  from public.demo_patients
  where id=s.patient_id and tester_id=p_tester;
  if not found then raise exception 'patient_not_found'; end if;

  task_title='Ολοκλήρωση καταγραφής · '||trim(concat_ws(' ',p.first_name,p.last_name));

  insert into public.demo_tasks(tester_id,patient_id,source_session_id,title,status)
  values(p_tester,s.patient_id,s.id,task_title,'open')
  on conflict (tester_id,source_session_id)
    where source_session_id is not null and status='open'
  do update set title=excluded.title,updated_at=now()
  returning * into t;

  return t;
end $$;

revoke all on function private.pilot_impl_demo_task_for_session(uuid,uuid) from public,anon,authenticated;

create or replace function public.demo_task_for_session(
  p_tester uuid,
  p_session uuid
)
returns public.demo_tasks
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.pilot_assert_owner(p_tester);
  return private.pilot_impl_demo_task_for_session(p_tester,p_session);
end $$;

revoke all on function public.demo_task_for_session(uuid,uuid) from public,anon;
grant execute on function public.demo_task_for_session(uuid,uuid) to authenticated;

create or replace function public.demo_session_finalize(
  p_tester uuid,
  p_session uuid,
  p_expected_version integer
)
returns public.demo_sessions
language plpgsql
security definer
set search_path=''
as $$
declare result public.demo_sessions;
begin
  perform private.pilot_assert_owner(p_tester);
  result:=private.pilot_impl_demo_session_finalize(p_tester,p_session,p_expected_version);
  update public.demo_tasks
  set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
  where tester_id=p_tester and source_session_id=result.id and status='open';
  return result;
end $$;