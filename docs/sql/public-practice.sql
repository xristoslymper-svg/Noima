-- Apply exclusively to isolated Noima Calendar Preview. No production migration.
create table public.practice_sites (
 owner_id uuid primary key, slug text unique not null check(slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
 content jsonb not null, revision integer not null default 1, published_at timestamptz not null default now(),
 check(octet_length(content::text)<200000)
);
create table public.practice_requests (
 site_id uuid not null references public.practice_sites(owner_id), id uuid not null,
 payload jsonb not null, fingerprint text not null, created_at timestamptz not null default now(),
 primary key(site_id,id), unique(site_id,fingerprint), check(octet_length(payload::text)<3000)
);
alter table public.practice_sites enable row level security;
alter table public.practice_requests enable row level security;
revoke all on public.practice_sites,public.practice_requests from anon,authenticated;
grant all on public.practice_sites,public.practice_requests to service_role;
create function public.practice_publish(p_owner uuid,p_content jsonb,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.practice_sites;
begin
 perform pg_advisory_xact_lock(hashtext(p_owner::text));
 select * into s from public.practice_sites where owner_id=p_owner for update;
 if found then
  if s.revision<>p_revision then raise exception 'publication_conflict'; end if;
  update public.practice_sites set content=p_content,revision=revision+1,published_at=now() where owner_id=p_owner returning * into s;
 else
  if p_revision<>0 then raise exception 'publication_conflict'; end if;
  if (select count(*) from public.practice_sites)>=50 then raise exception 'preview_limit'; end if;
  insert into public.practice_sites(owner_id,slug,content) values(p_owner,'iatreio-'||replace(p_owner::text,'-',''),p_content) returning * into s;
 end if;
 return jsonb_build_object('slug',s.slug,'revision',s.revision,'content',s.content);
end $$;
create function public.practice_request(p_slug text,p_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.practice_sites; f text; rid uuid;
begin
 select * into s from public.practice_sites where slug=p_slug for update;
 if not found then raise exception 'not_found'; end if;
 f=md5(lower(trim(p_payload->>'email'))||':'||lower(trim(p_payload->>'preference')));
 select id into rid from public.practice_requests where site_id=s.owner_id and (id=p_id or fingerprint=f);
 if rid is not null then return jsonb_build_object('received',true); end if;
 if (select count(*) from public.practice_requests where site_id=s.owner_id and created_at>now()-interval '1 day')>=100
 or (select count(*) from public.practice_requests)>=1000 then raise exception 'preview_limit'; end if;
 insert into public.practice_requests(site_id,id,payload,fingerprint) values(s.owner_id,p_id,p_payload,f);
 return jsonb_build_object('received',true);
end $$;
revoke all on function public.practice_publish(uuid,jsonb,integer),public.practice_request(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.practice_publish(uuid,jsonb,integer),public.practice_request(text,uuid,jsonb) to service_role;
