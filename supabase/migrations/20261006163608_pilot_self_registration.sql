-- The owner requested sharing the app URL rather than access codes.
-- Verified authentication is still required; each account gets an empty tenant.
create function public.pilot_join(p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'verified_email_required'; end if;
 if length(trim(p_name)) not between 2 and 100 then raise exception 'invalid_name'; end if;
 insert into private.pilot_members(user_id,full_name) values(auth.uid(),trim(p_name)) on conflict(user_id) do nothing;
 return public.pilot_identity();
end $$;
revoke all on function public.pilot_join(text) from public,anon;
grant execute on function public.pilot_join(text) to authenticated;
