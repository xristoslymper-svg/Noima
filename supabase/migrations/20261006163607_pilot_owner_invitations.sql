alter table private.pilot_members add column can_invite boolean not null default false;
alter table private.pilot_invitations add column created_by uuid references auth.users(id), add column grants_invite boolean not null default false, add column revoked_at timestamptz;
create or replace function public.pilot_identity() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('workspace_id',workspace_id,'full_name',full_name,'can_restore',previous_workspace_id is not null,'can_invite',can_invite)
 from private.pilot_members where user_id=(select auth.uid()) and active
$$;
create or replace function public.pilot_redeem_invitation(p_code text,p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); invitation private.pilot_invitations; verified_email text;
begin
 if uid is null then raise exception 'authentication_required'; end if;
 if length(trim(p_name)) not between 2 and 100 then raise exception 'invalid_name'; end if;
 select lower(email) into verified_email from auth.users where id=uid and email_confirmed_at is not null;
 if verified_email is null then raise exception 'verified_email_required'; end if;
 select * into invitation from private.pilot_invitations where token_hash=encode(sha256(convert_to(trim(p_code),'UTF8')),'hex') for update;
 if invitation.token_hash is null or invitation.revoked_at is not null or invitation.expires_at<now() or (invitation.redeemed_by is not null and invitation.redeemed_by<>uid)
  or (invitation.email is not null and lower(invitation.email)<>verified_email) then raise exception 'invalid_invitation'; end if;
 insert into private.pilot_members(user_id,full_name,can_invite) values(uid,trim(p_name),invitation.grants_invite)
 on conflict(user_id) do update set can_invite=private.pilot_members.can_invite or excluded.can_invite;
 update private.pilot_invitations set redeemed_by=uid,redeemed_at=coalesce(redeemed_at,now()) where token_hash=invitation.token_hash;
 return public.pilot_identity();
end $$;
create function public.pilot_invite_create(p_email text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare code text; expiry timestamptz:=now()+interval '14 days';
begin
 if not exists(select 1 from private.pilot_members where user_id=auth.uid() and active and can_invite) then raise exception 'owner_required'; end if;
 if nullif(trim(p_email),'') is not null and (length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'invalid_email'; end if;
 if (select count(*) from private.pilot_invitations where created_by=auth.uid() and redeemed_by is null and revoked_at is null and expires_at>now())>=30 then raise exception 'invite_limit'; end if;
 code:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
 insert into private.pilot_invitations(token_hash,email,expires_at,created_by) values(encode(sha256(convert_to(code,'UTF8')),'hex'),nullif(lower(trim(p_email)),''),expiry,auth.uid());
 return jsonb_build_object('code',code,'expires_at',expiry);
end $$;
create function public.pilot_invite_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from private.pilot_members where user_id=auth.uid() and active and can_invite) then raise exception 'owner_required'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',token_hash,'email',email,'expires_at',expires_at,'redeemed_at',redeemed_at,'revoked_at',revoked_at) order by expires_at desc),'[]'::jsonb) from private.pilot_invitations where created_by=auth.uid());
end $$;
create function public.pilot_invite_revoke(p_id text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.pilot_members where user_id=auth.uid() and active and can_invite) then raise exception 'owner_required'; end if;
 update private.pilot_invitations set revoked_at=now() where token_hash=p_id and created_by=auth.uid() and redeemed_by is null;
 if not found then raise exception 'invitation_unavailable'; end if;
end $$;
revoke all on function public.pilot_invite_create(text),public.pilot_invite_list(),public.pilot_invite_revoke(text) from public,anon;
grant execute on function public.pilot_invite_create(text),public.pilot_invite_list(),public.pilot_invite_revoke(text) to authenticated;
