-- New optional narrative sections use the encounter's existing ownership,
-- immutable-record triggers, bundle reads and summary source boundary.
-- Preview activation only: do not apply to the shared production database.
alter table public.demo_session_sections drop constraint demo_session_sections_section_key_check;
alter table public.demo_session_sections add constraint demo_session_sections_section_key_check check (
 section_key in ('interview','functioning','adherence','effects','mse','assessment','plan','review')
 or section_key ~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);
create function public.demo_visit_custom_save(p_tester uuid,p_session uuid,p_section text,p_title text,p_content text,p_expected_version integer default null)
returns public.demo_session_sections language plpgsql security definer set search_path='' as $$
declare s public.demo_sessions; r public.demo_session_sections;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
 if not found or s.status<>'draft' then raise exception 'session_unavailable'; end if;
 if p_section is null or p_section !~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or p_title is null or length(trim(p_title)) not between 1 and 100 or p_title ~ E'[\n\r]'
 or p_content is null or length(p_content)>20000 then raise exception 'invalid_section'; end if;
 select * into r from public.demo_session_sections where session_id=s.id and section_key=p_section for update;
 if found then
  if p_expected_version is distinct from r.version then raise exception 'stale_section'; end if;
  update public.demo_session_sections set content=trim(p_title)||E'\n\n'||p_content,version=version+1,source='manual',updated_at=now()
  where id=r.id returning * into r;
 else
  if p_expected_version is not null then raise exception 'stale_section'; end if;
  if (select count(*) from public.demo_session_sections where session_id=s.id and section_key like 'custom:%')>=20 then raise exception 'custom_section_limit'; end if;
  insert into public.demo_session_sections(tester_id,patient_id,session_id,section_key,content,source)
  values(p_tester,s.patient_id,s.id,p_section,trim(p_title)||E'\n\n'||p_content,'manual') returning * into r;
 end if;
 update public.demo_sessions set version=version+1,updated_at=now() where id=s.id;
 return r;
end $$;
revoke all on function public.demo_visit_custom_save(uuid,uuid,text,text,text,integer) from public,anon;
grant execute on function public.demo_visit_custom_save(uuid,uuid,text,text,text,integer) to authenticated;
