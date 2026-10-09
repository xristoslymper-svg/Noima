-- Approved visit continuity is the source. Only subsequent explicit revisions are stored.
create table private.demo_context_revisions (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 tester_id uuid not null,
 patient_id uuid not null references public.demo_patients(id),
 source_session_id uuid not null references public.demo_sessions(id),
 revision integer not null check(revision>0),
 action text not null check(action in ('updated','resolved')),
 content text not null check(length(trim(content)) between 1 and 2000),
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(source_session_id,revision)
);
create index context_patient_revisions on private.demo_context_revisions(tester_id,patient_id,created_at);
alter table private.demo_context_revisions enable row level security;
revoke all on private.demo_context_revisions from public,anon,authenticated;
create policy context_owner on private.demo_context_revisions to authenticated
 using(private.pilot_owns(tester_id)) with check(private.pilot_owns(tester_id));
-- Immutable revision rows; public entry points enforce workspace and source ownership.
create function private.demo_context_revision_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'context_revision_immutable'; end $$;
create trigger context_revision_immutable before update or delete on private.demo_context_revisions for each row execute function private.demo_context_revision_immutable();
revoke all on function private.demo_context_revision_immutable() from public,anon,authenticated;
create function public.demo_context_revisions(p_tester uuid,p_patient uuid)
returns setof private.demo_context_revisions language plpgsql security definer set search_path='' as $$
begin
 perform private.pilot_assert_owner(p_tester);
 if not exists(select 1 from public.demo_patients where id=p_patient and tester_id=p_tester) then raise exception 'patient_not_found'; end if;
 return query select * from private.demo_context_revisions where tester_id=p_tester and patient_id=p_patient order by source_session_id,revision;
end $$;
create function public.demo_context_revise(p_tester uuid,p_session uuid,p_request uuid,p_action text,p_content text,p_expected_revision integer)
returns private.demo_context_revisions language plpgsql security definer set search_path='' as $$
declare s public.demo_sessions; r private.demo_context_revisions; n integer;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
 if not found then raise exception 'session_unavailable'; end if;
 if s.status<>'completed' or s.continuity->>'approved_at' is null or length(trim(coalesce(s.continuity->>'pinned_context','')))=0 then raise exception 'confirmed_context_required'; end if;
 select * into r from private.demo_context_revisions where request_id=p_request;
 if found then
  if r.tester_id<>p_tester or r.source_session_id<>p_session or r.action is distinct from p_action or (p_action='updated' and r.content is distinct from trim(p_content)) then raise exception 'context_request_conflict'; end if;
  return r;
 end if;
 select coalesce(max(revision),0) into n from private.demo_context_revisions where source_session_id=s.id;
 if n is distinct from p_expected_revision then raise exception 'stale_context'; end if;
 if p_action is null or p_action not in ('updated','resolved') or p_request is null then raise exception 'invalid_context'; end if;
 if exists(select 1 from private.demo_context_revisions where source_session_id=s.id and revision=n and action='resolved') then raise exception 'context_resolved'; end if;
 if p_action='resolved' then
  select content into p_content from private.demo_context_revisions where source_session_id=s.id and revision=n;
  p_content:=coalesce(p_content,s.continuity->>'pinned_context');
 end if;
 if length(trim(coalesce(p_content,''))) not between 1 and 2000 then raise exception 'invalid_context'; end if;
 insert into private.demo_context_revisions(request_id,tester_id,patient_id,source_session_id,revision,action,content,actor_id)
 values(p_request,p_tester,s.patient_id,s.id,n+1,p_action,trim(p_content),auth.uid()) returning * into r;
 return r;
end $$;
revoke all on function public.demo_context_revisions(uuid,uuid),public.demo_context_revise(uuid,uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.demo_context_revisions(uuid,uuid),public.demo_context_revise(uuid,uuid,uuid,text,text,integer) to authenticated;
