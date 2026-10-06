-- Deterministic operational states for the pilot dashboard.
-- Widgets are projections of explicit payment, assessment-review and task states.

alter table public.demo_calendar_events
  add column if not exists payment_status text not null default 'unknown'
  check (payment_status in ('unknown','pending','paid','not_applicable'));

alter table private.demo_assessments
  add column if not exists reviewed_at timestamptz;

create table if not exists public.demo_tasks (
  id uuid primary key default gen_random_uuid(),
  tester_id uuid not null,
  patient_id uuid null references public.demo_patients(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 240),
  due_at timestamptz null,
  status text not null default 'open' check (status in ('open','completed')),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_tasks_tester_status_idx
  on public.demo_tasks(tester_id,status,created_at desc);

alter table public.demo_tasks enable row level security;
revoke all on table public.demo_tasks from anon, authenticated;
drop policy if exists pilot_owner_read on public.demo_tasks;
create policy pilot_owner_read on public.demo_tasks
  for select to authenticated
  using (private.pilot_owns(tester_id));
grant select on public.demo_tasks to authenticated;

create or replace function private.pilot_impl_demo_payment_set(
  p_tester uuid,
  p_event uuid,
  p_status text
)
returns public.demo_calendar_events
language plpgsql
security definer
set search_path=public,private
as $$
declare e public.demo_calendar_events;
begin
  if p_status not in ('pending','paid','not_applicable') then
    raise exception 'invalid_payment_status';
  end if;

  select * into e
  from public.demo_calendar_events
  where id=p_event and tester_id=p_tester
  for update;

  if not found then raise exception 'event_not_found'; end if;

  update public.demo_calendar_events
  set payment_status=p_status, updated_at=now()
  where id=p_event and tester_id=p_tester
  returning * into e;

  return e;
end $$;

revoke all on function private.pilot_impl_demo_payment_set(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.demo_payment_set(
  p_tester uuid,
  p_event uuid,
  p_status text
)
returns public.demo_calendar_events
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.pilot_assert_owner(p_tester);
  return private.pilot_impl_demo_payment_set(p_tester,p_event,p_status);
end $$;

revoke all on function public.demo_payment_set(uuid,uuid,text) from public,anon;
grant execute on function public.demo_payment_set(uuid,uuid,text) to authenticated;

create or replace function private.pilot_impl_demo_task_list(p_tester uuid)
returns jsonb
language sql
security definer
set search_path=public,private
as $$
  select coalesce(
    jsonb_agg(to_jsonb(t) order by (t.status='open') desc, t.created_at desc),
    '[]'::jsonb
  )
  from public.demo_tasks t
  where t.tester_id=p_tester
$$;

create or replace function private.pilot_impl_demo_task_create(
  p_tester uuid,
  p_title text,
  p_patient uuid default null,
  p_due_at timestamptz default null
)
returns public.demo_tasks
language plpgsql
security definer
set search_path=public,private
as $$
declare t public.demo_tasks;
begin
  if length(trim(coalesce(p_title,'')))<1 or length(trim(p_title))>240 then
    raise exception 'invalid_task';
  end if;
  if p_patient is not null and not exists(
    select 1 from public.demo_patients where id=p_patient and tester_id=p_tester
  ) then
    raise exception 'patient_not_found';
  end if;
  insert into public.demo_tasks(tester_id,patient_id,title,due_at)
  values(p_tester,p_patient,trim(p_title),p_due_at)
  returning * into t;
  return t;
end $$;

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
  update public.demo_tasks
  set status=p_status,
      completed_at=case when p_status='completed' then coalesce(completed_at,now()) else null end,
      updated_at=now()
  where id=p_id and tester_id=p_tester
  returning * into t;
  if not found then raise exception 'task_not_found'; end if;
  return t;
end $$;

revoke all on function private.pilot_impl_demo_task_list(uuid) from public,anon,authenticated;
revoke all on function private.pilot_impl_demo_task_create(uuid,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function private.pilot_impl_demo_task_set_status(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.demo_task_list(p_tester uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.pilot_assert_owner(p_tester);
  return private.pilot_impl_demo_task_list(p_tester);
end $$;

create or replace function public.demo_task_create(
  p_tester uuid,
  p_title text,
  p_patient uuid default null,
  p_due_at timestamptz default null
)
returns public.demo_tasks
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.pilot_assert_owner(p_tester);
  return private.pilot_impl_demo_task_create(p_tester,p_title,p_patient,p_due_at);
end $$;

create or replace function public.demo_task_set_status(
  p_tester uuid,
  p_id uuid,
  p_status text
)
returns public.demo_tasks
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.pilot_assert_owner(p_tester);
  return private.pilot_impl_demo_task_set_status(p_tester,p_id,p_status);
end $$;

revoke all on function public.demo_task_list(uuid) from public,anon;
revoke all on function public.demo_task_create(uuid,text,uuid,timestamptz) from public,anon;
revoke all on function public.demo_task_set_status(uuid,uuid,text) from public,anon;
grant execute on function public.demo_task_list(uuid) to authenticated;
grant execute on function public.demo_task_create(uuid,text,uuid,timestamptz) to authenticated;
grant execute on function public.demo_task_set_status(uuid,uuid,text) to authenticated;

create or replace function private.pilot_impl_demo_assessment_review(
  p_tester uuid,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path=public,private
as $$
declare s text;
begin
  select status into s from private.demo_assessments
  where id=p_id and tester_id=p_tester
  for update;
  if not found then raise exception 'assessment_not_found'; end if;
  if s<>'completed' then raise exception 'assessment_not_completed'; end if;
  update private.demo_assessments
  set reviewed_at=coalesce(reviewed_at,now())
  where id=p_id and tester_id=p_tester;
end $$;

revoke all on function private.pilot_impl_demo_assessment_review(uuid,uuid) from public,anon,authenticated;

create or replace function public.demo_assessment_review(
  p_tester uuid,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.pilot_assert_owner(p_tester);
  perform private.pilot_impl_demo_assessment_review(p_tester,p_id);
end $$;

revoke all on function public.demo_assessment_review(uuid,uuid) from public,anon;
grant execute on function public.demo_assessment_review(uuid,uuid) to authenticated;
