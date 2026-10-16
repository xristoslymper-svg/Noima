-- Versioned, clinician-authored retrospective course; no fabricated encounters.
create table private.demo_patient_prior_course_versions (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 tester_id uuid not null,
 patient_id uuid not null references public.demo_patients(id),
 version integer not null check (version>0),
 period_label text not null default '' check (length(period_label)<=120),
 content text not null check (length(trim(content)) between 15 and 12000),
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(tester_id,patient_id,version)
);
create index patient_prior_course_lookup on private.demo_patient_prior_course_versions(tester_id,patient_id,version desc);
alter table private.demo_patient_prior_course_versions enable row level security;
revoke all on private.demo_patient_prior_course_versions from public,anon,authenticated;
create policy prior_course_owner on private.demo_patient_prior_course_versions to authenticated
 using (private.pilot_owns(tester_id)) with check(private.pilot_owns(tester_id));
create function private.demo_prior_course_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'prior_course_immutable'; end $$;
create trigger prior_course_immutable before update or delete on private.demo_patient_prior_course_versions
 for each row execute function private.demo_prior_course_immutable();
revoke all on function private.demo_prior_course_immutable() from public,anon,authenticated;
create function public.demo_prior_course_get(p_tester uuid,p_patient uuid)
returns setof private.demo_patient_prior_course_versions language plpgsql security definer set search_path='' as $$
begin
 perform private.pilot_assert_owner(p_tester);
 if not exists(select 1 from public.demo_patients where id=p_patient and tester_id=p_tester)
 then raise exception 'patient_not_found'; end if;
 return query select * from private.demo_patient_prior_course_versions
  where tester_id=p_tester and patient_id=p_patient order by version desc limit 1;
end $$;
create function public.demo_prior_course_save(
 p_tester uuid,p_patient uuid,p_request uuid,p_expected_version integer,p_period text,p_content text
) returns private.demo_patient_prior_course_versions language plpgsql security definer set search_path='' as $$
declare r private.demo_patient_prior_course_versions; last_version integer;
begin
 perform private.pilot_assert_owner(p_tester);
 if p_request is null or p_expected_version is null or p_expected_version<0
    or length(trim(coalesce(p_content,''))) not between 15 and 12000
    or length(coalesce(p_period,''))>120 then raise exception 'invalid_prior_course'; end if;
 perform 1 from public.demo_patients where id=p_patient and tester_id=p_tester for update;
 if not found then raise exception 'patient_not_found'; end if;
 select * into r from private.demo_patient_prior_course_versions where request_id=p_request;
 if found then
   if r.tester_id<>p_tester or r.patient_id<>p_patient or r.content is distinct from trim(p_content)
      or r.period_label is distinct from trim(coalesce(p_period,'')) then raise exception 'prior_course_request_conflict'; end if;
   return r;
 end if;
 select coalesce(max(version),0) into last_version from private.demo_patient_prior_course_versions
 where tester_id=p_tester and patient_id=p_patient;
 if last_version<>p_expected_version then raise exception 'stale_prior_course'; end if;
 insert into private.demo_patient_prior_course_versions(request_id,tester_id,patient_id,version,period_label,content,actor_id)
 values(p_request,p_tester,p_patient,last_version+1,trim(coalesce(p_period,'')),trim(p_content),auth.uid())
 returning * into r;
 return r;
end $$;
revoke all on function public.demo_prior_course_get(uuid,uuid),
 public.demo_prior_course_save(uuid,uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.demo_prior_course_get(uuid,uuid),
 public.demo_prior_course_save(uuid,uuid,uuid,integer,text,text) to authenticated;
