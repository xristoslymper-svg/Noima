-- Invitation-only fictional pilot. Existing clinical records are retained.
create table private.pilot_members (
 user_id uuid primary key references auth.users(id), workspace_id uuid not null unique default gen_random_uuid(),
 previous_workspace_id uuid, full_name text not null, active boolean not null default true, created_at timestamptz not null default now()
);
create table private.pilot_invitations (
 token_hash text primary key, email text, expires_at timestamptz not null default now()+interval '30 days',
 redeemed_by uuid unique references auth.users(id), redeemed_at timestamptz
);
create table private.pilot_feedback (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 workspace_id uuid not null, category text not null check(category in ('bug','idea','experience')),
 message text not null check(length(message) between 5 and 4000), page text not null default '', created_at timestamptz not null default now()
);
create table private.pilot_workspace_audit (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), action text not null,
 old_workspace uuid, new_workspace uuid, created_at timestamptz not null default now()
);
alter table private.pilot_members enable row level security;
alter table private.pilot_invitations enable row level security;
alter table private.pilot_feedback enable row level security;
alter table private.pilot_workspace_audit enable row level security;
revoke all on private.pilot_members,private.pilot_invitations,private.pilot_feedback,private.pilot_workspace_audit from public,anon,authenticated;

create function private.pilot_owns(p_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.pilot_members where user_id=(select auth.uid()) and active and workspace_id=p_workspace)
$$;
revoke all on function private.pilot_owns(uuid) from public,anon;
grant execute on function private.pilot_owns(uuid) to authenticated;
create function private.pilot_assert_owner(p_workspace uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
 -- Database maintenance and in-process migration tests retain privileged access.
 -- API calls always run with anon/authenticated role, including SECURITY DEFINER calls.
 if current_setting('role',true) in ('anon','authenticated') and not private.pilot_owns(p_workspace) then
  raise exception 'pilot_not_authorized' using errcode='42501';
 end if;
end $$;
revoke all on function private.pilot_assert_owner(uuid) from public,anon,authenticated;

create function public.pilot_identity() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('workspace_id',workspace_id,'full_name',full_name,'can_restore',previous_workspace_id is not null)
 from private.pilot_members where user_id=(select auth.uid()) and active
$$;
create function public.pilot_redeem_invitation(p_code text,p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); invitation private.pilot_invitations; verified_email text;
begin
 if uid is null then raise exception 'authentication_required'; end if;
 if length(trim(p_name)) not between 2 and 100 then raise exception 'invalid_name'; end if;
 select lower(email) into verified_email from auth.users where id=uid and email_confirmed_at is not null;
 if verified_email is null then raise exception 'verified_email_required'; end if;
 select * into invitation from private.pilot_invitations where token_hash=encode(sha256(convert_to(trim(p_code),'UTF8')),'hex') for update;
 if invitation.token_hash is null or invitation.expires_at<now() or (invitation.redeemed_by is not null and invitation.redeemed_by<>uid)
  or (invitation.email is not null and lower(invitation.email)<>verified_email) then raise exception 'invalid_invitation'; end if;
 insert into private.pilot_members(user_id,full_name) values(uid,trim(p_name)) on conflict(user_id) do nothing;
 update private.pilot_invitations set redeemed_by=uid,redeemed_at=coalesce(redeemed_at,now()) where token_hash=invitation.token_hash;
 return public.pilot_identity();
end $$;
create function public.pilot_feedback_submit(p_category text,p_message text,p_page text) returns uuid language plpgsql security definer set search_path='' as $$
declare wid uuid; result uuid;
begin
 select workspace_id into wid from private.pilot_members where user_id=auth.uid() and active;
 if wid is null then raise exception 'pilot_not_authorized'; end if;
 insert into private.pilot_feedback(user_id,workspace_id,category,message,page) values(auth.uid(),wid,p_category,trim(p_message),left(p_page,300)) returning id into result;
 return result;
end $$;
create function public.pilot_reset_workspace(p_restore boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare member private.pilot_members; new_id uuid;
begin
 select * into member from private.pilot_members where user_id=auth.uid() and active for update;
 if member.user_id is null then raise exception 'pilot_not_authorized'; end if;
 if p_restore and member.previous_workspace_id is null then raise exception 'nothing_to_restore'; end if;
 new_id:=case when p_restore then member.previous_workspace_id else gen_random_uuid() end;
 update private.pilot_members set workspace_id=new_id,previous_workspace_id=member.workspace_id where user_id=member.user_id;
 insert into private.pilot_workspace_audit(user_id,action,old_workspace,new_workspace) values(member.user_id,case when p_restore then 'restore' else 'reset' end,member.workspace_id,new_id);
 perform public.demo_tester_bootstrap(new_id); perform public.demo_seed_maria_record(new_id);
 return public.pilot_identity();
end $$;
revoke all on function public.pilot_identity(),public.pilot_redeem_invitation(text,text),public.pilot_feedback_submit(text,text,text),public.pilot_reset_workspace(boolean) from public,anon;
grant execute on function public.pilot_identity(),public.pilot_redeem_invitation(text,text),public.pilot_feedback_submit(text,text,text),public.pilot_reset_workspace(boolean) to authenticated;

-- Preserve each audited implementation in an unexposed schema. Every public
-- tester-scoped RPC is now a checked entry point, including legacy overloads.
do $$
declare f record; arguments text; call_arguments text; implementation text; body text;
begin
 for f in select p.*,pg_get_function_arguments(p.oid) as args,pg_get_function_result(p.oid) as result,
  pg_get_function_identity_arguments(p.oid) as identity_args
  from pg_proc p where pronamespace='public'::regnamespace and proname like 'demo_%' and 'p_tester'=any(proargnames)
 loop
  implementation:='pilot_impl_'||f.proname;
  select string_agg(quote_ident(x),',' order by position) into call_arguments from unnest(f.proargnames) with ordinality as names(x,position) where position<=f.pronargs;
  execute format('alter function public.%I(%s) set schema private',f.proname,f.identity_args);
  execute format('alter function private.%I(%s) rename to %I',f.proname,f.identity_args,implementation);
  execute format('revoke all on function private.%I(%s) from public,anon,authenticated',implementation,f.identity_args);
  -- Test fixtures remain available to privileged maintenance. An authenticated
  -- workspace starts empty and repeated reads never insert sample records.
  body:=format('begin perform private.pilot_assert_owner(p_tester); %s %s private.%I(%s); end',
   case when f.proname in ('demo_tester_bootstrap','demo_seed_maria_record') then 'if auth.uid() is not null then return; end if;' else '' end,
   case when f.proretset then 'return query select * from' when f.prorettype='void'::regtype then 'perform' else 'return' end,implementation,call_arguments);
  execute format('create function public.%I(%s) returns %s language plpgsql security definer set search_path='''' as %L',f.proname,f.args,f.result,body);
  execute format('revoke all on function public.%I(%s) from public,anon',f.proname,f.identity_args);
  execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity_args);
 end loop;
 -- Retired unscoped endpoints and internal helpers cannot be called directly.
 for f in select oid,proname,pg_get_function_identity_arguments(oid) args from pg_proc where pronamespace='public'::regnamespace and proname like 'demo_%' and not coalesce('p_tester'=any(proargnames),false) and proname not in ('demo_assessment_open','demo_assessment_submit') loop
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,f.args);
 end loop;
 for f in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'demo_%' loop
  execute format('alter table public.%I enable row level security',f.relname);
  for arguments in select policyname from pg_policies where schemaname='public' and tablename=f.relname loop
   execute format('drop policy %I on public.%I',arguments,f.relname);
  end loop;
  execute format('revoke all on public.%I from public,anon,authenticated',f.relname);
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=f.relname and column_name='tester_id') then
   execute format('grant select on public.%I to authenticated',f.relname);
   execute format('create policy pilot_owner_read on public.%I for select to authenticated using (private.pilot_owns(tester_id))',f.relname);
  end if;
 end loop;
end $$;

-- The summary cache was created before pilot ownership existed. The generic
-- table hardening above intentionally grants read-only access; this derived
-- cache also needs owner-scoped writes from the authenticated server client.
grant insert, update on public.demo_clinical_summary_cache to authenticated;
drop policy if exists pilot_owner_insert on public.demo_clinical_summary_cache;
drop policy if exists pilot_owner_update on public.demo_clinical_summary_cache;
create policy pilot_owner_insert on public.demo_clinical_summary_cache
for insert to authenticated with check (private.pilot_owns(tester_id));
create policy pilot_owner_update on public.demo_clinical_summary_cache
for update to authenticated using (private.pilot_owns(tester_id))
with check (private.pilot_owns(tester_id));
