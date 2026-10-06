-- Session-linked pending record tasks are projections of record state and cannot be manually completed.
create or replace function private.pilot_impl_demo_task_set_status(
  p_tester uuid,
  p_id uuid,
  p_status text
)
returns public.demo_tasks
language plpgsql
security definer
set search_path=public,private
as $$
declare t public.demo_tasks;
begin
  if p_status not in ('open','completed') then raise exception 'invalid_task_status'; end if;
  select * into t from public.demo_tasks where id=p_id and tester_id=p_tester for update;
  if not found then raise exception 'task_not_found'; end if;
  if t.source_session_id is not null and p_status='completed' then
    raise exception 'task_managed_by_record';
  end if;
  update public.demo_tasks
  set status=p_status,
      completed_at=case when p_status='completed' then coalesce(completed_at,now()) else null end,
      updated_at=now()
  where id=p_id and tester_id=p_tester
  returning * into t;
  return t;
end $$;