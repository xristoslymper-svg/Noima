-- Tokens are encrypted by the application with an independent server-only key.
create table private.pilot_mailboxes(user_id uuid primary key references auth.users(id), provider text not null check(provider in ('google','microsoft')), email text not null, encrypted_tokens text not null, updated_at timestamptz not null default now());
create table private.pilot_mail_deliveries(assessment_id uuid primary key references private.demo_assessments(id),user_id uuid not null references auth.users(id), recipient text not null, status text not null check(status in ('claimed','accepted','failed','unknown')), provider_id text, updated_at timestamptz not null default now());
alter table private.pilot_mailboxes enable row level security;
alter table private.pilot_mail_deliveries enable row level security;
revoke all on private.pilot_mailboxes,private.pilot_mail_deliveries from public,anon,authenticated;
create function public.pilot_mailbox_get() returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(m)-'user_id' from private.pilot_mailboxes m where m.user_id=auth.uid() and public.pilot_identity() is not null;
$$;
create function public.pilot_mailbox_save(p_provider text,p_email text,p_tokens text) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.pilot_identity() is null then raise exception 'not_authorized'; end if;
 if p_provider not in ('google','microsoft') or length(p_email) not between 3 and 254 or length(p_tokens) not between 20 and 16000 then raise exception 'invalid_mailbox'; end if;
 insert into private.pilot_mailboxes(user_id,provider,email,encrypted_tokens) values(auth.uid(),p_provider,p_email,p_tokens) on conflict(user_id) do update set provider=excluded.provider,email=excluded.email,encrypted_tokens=excluded.encrypted_tokens,updated_at=now();
end $$;
create function public.pilot_mailbox_disconnect() returns void language plpgsql security definer set search_path='' as $$
begin
 if public.pilot_identity() is null then raise exception 'not_authorized'; end if;
 delete from private.pilot_mailboxes where user_id=auth.uid();
end $$;
create function public.pilot_mail_claim(p_assessment uuid,p_token text,p_recipient text) returns text language plpgsql security definer set search_path='' as $$
declare a private.demo_assessments; existing private.pilot_mail_deliveries;
begin
 select * into a from private.demo_assessments where id=p_assessment for update;
 if not found or not private.pilot_owns(a.tester_id) or a.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') or a.status not in ('assigned','opened') or a.expires_at<=now() then raise exception 'assessment_unavailable'; end if;
 if length(p_recipient) not between 3 and 254 then raise exception 'invalid_recipient'; end if;
 select * into existing from private.pilot_mail_deliveries where assessment_id=p_assessment;
 if found and existing.status<>'failed' then return existing.status; end if;
 insert into private.pilot_mail_deliveries(assessment_id,user_id,recipient,status) values(p_assessment,auth.uid(),p_recipient,'claimed') on conflict(assessment_id) do update set status='claimed',recipient=excluded.recipient,updated_at=now();
 return 'new';
end $$;
create function public.pilot_mail_finish(p_assessment uuid,p_status text,p_provider_id text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.pilot_identity() is null or p_status not in ('accepted','failed','unknown') then raise exception 'not_authorized'; end if;
 update private.pilot_mail_deliveries set status=p_status,provider_id=p_provider_id,updated_at=now() where assessment_id=p_assessment and user_id=auth.uid() and status='claimed';
 if not found then raise exception 'delivery_unavailable'; end if;
end $$;
revoke all on function public.pilot_mailbox_get(),public.pilot_mailbox_save(text,text,text),public.pilot_mailbox_disconnect(),public.pilot_mail_claim(uuid,text,text),public.pilot_mail_finish(uuid,text,text) from public,anon;
grant execute on function public.pilot_mailbox_get(),public.pilot_mailbox_save(text,text,text),public.pilot_mailbox_disconnect(),public.pilot_mail_claim(uuid,text,text),public.pilot_mail_finish(uuid,text,text) to authenticated;
