-- Structured, append-only corrections for completed clinical records.
create table if not exists public.demo_session_corrections(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 tester_id uuid not null,
 actor_id uuid not null,
 patient_id uuid not null references public.demo_patients(id) on delete cascade,
 session_id uuid not null references public.demo_sessions(id) on delete cascade,
 reason text not null check(length(trim(reason)) between 1 and 500),
 patch jsonb not null check(jsonb_typeof(patch)='object'),
 created_at timestamptz not null default now()
);
create index if not exists demo_session_corrections_session_idx on public.demo_session_corrections(tester_id,session_id,created_at);
alter table public.demo_session_corrections enable row level security;
revoke all on table public.demo_session_corrections from anon,authenticated;
drop policy if exists pilot_owner_read on public.demo_session_corrections;
create policy pilot_owner_read on public.demo_session_corrections for select to authenticated using(private.pilot_owns(tester_id));
grant select on public.demo_session_corrections to authenticated;

create or replace function private.pilot_impl_demo_session_correction_create(
 p_tester uuid,p_session uuid,p_request uuid,p_reason text,p_patch jsonb
) returns public.demo_session_corrections
language plpgsql security definer set search_path=public,private as $$
declare s public.demo_sessions; r public.demo_session_corrections; k text;
begin
 select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
 if not found or s.status<>'completed' then raise exception 'completed_session_required'; end if;
 select * into r from public.demo_session_corrections where request_id=p_request;
 if found then
  if r.tester_id<>p_tester or r.session_id<>p_session or r.reason<>trim(p_reason) or r.patch<>p_patch then raise exception 'request_conflict'; end if;
  return r;
 end if;
 if length(trim(coalesce(p_reason,'')))=0 or length(trim(p_reason))>500 then raise exception 'correction_reason_required'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or pg_column_size(p_patch)>200000 then raise exception 'invalid_correction_patch'; end if;
 for k in select jsonb_object_keys(p_patch) loop
  if k not in ('interview','functioning','adherence','effects','mse','assessment','plan','review','risk') then raise exception 'invalid_correction_patch'; end if;
  if jsonb_typeof(p_patch->k)<>'object' or not (p_patch->k ? 'before') or not (p_patch->k ? 'after') then raise exception 'invalid_correction_patch'; end if;
 end loop;
 insert into public.demo_session_corrections(request_id,tester_id,actor_id,patient_id,session_id,reason,patch)
 values(p_request,p_tester,p_tester,s.patient_id,s.id,trim(p_reason),p_patch) returning * into r;
 return r;
end $$;
revoke all on function private.pilot_impl_demo_session_correction_create(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;

create or replace function public.demo_session_correction_create(
 p_tester uuid,p_session uuid,p_request uuid,p_reason text,p_patch jsonb
) returns public.demo_session_corrections
language plpgsql security definer set search_path='' as $$
begin
 perform private.pilot_assert_owner(p_tester);
 return private.pilot_impl_demo_session_correction_create(p_tester,p_session,p_request,p_reason,p_patch);
end $$;
revoke all on function public.demo_session_correction_create(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.demo_session_correction_create(uuid,uuid,uuid,text,jsonb) to authenticated;

drop trigger if exists demo_session_correction_immutable on public.demo_session_corrections;
create trigger demo_session_correction_immutable before update or delete on public.demo_session_corrections for each row execute function public.demo_immutable_entry();