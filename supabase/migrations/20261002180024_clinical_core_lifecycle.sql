-- Extend existing runtime; no second patient identity.
create or replace function public.demo_session_save_section(p_tester uuid,p_session uuid,p_section text,p_content text,p_source text default 'manual',p_expected_version integer default null) returns public.demo_session_sections language plpgsql security definer set search_path=public as $$ declare s public.demo_sessions; r public.demo_session_sections; begin select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update; if s.id is null or s.status<>'draft' then raise exception 'session_unavailable'; end if; if p_section not in ('interview','functioning','adherence','effects','mse','assessment','plan','review') then raise exception 'invalid_section'; end if; select * into r from public.demo_session_sections where session_id=p_session and section_key=p_section for update; if coalesce(p_expected_version,0)<>coalesce(r.version,0) then raise exception 'stale_section'; end if; if r.id is null then insert into public.demo_session_sections(tester_id,patient_id,session_id,section_key,content,source) values(p_tester,s.patient_id,p_session,p_section,coalesce(p_content,''),p_source) returning * into r; else if p_expected_version is not null and r.version<>p_expected_version then raise exception 'stale_section'; end if; update public.demo_session_sections set content=coalesce(p_content,''),source=p_source,version=version+1,updated_at=now() where id=r.id returning * into r; end if; update public.demo_sessions set version=version+1,updated_at=now() where id=p_session; return r; end $$;

create or replace function public.demo_session_save_risk(p_tester uuid,p_session uuid,p_risk jsonb,p_expected_version integer default null) returns public.demo_risk_assessments language plpgsql security definer set search_path=public as $$ declare s public.demo_sessions; r public.demo_risk_assessments; begin select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update; if s.id is null or s.status<>'draft' then raise exception 'session_unavailable'; end if; select * into r from public.demo_risk_assessments where session_id=p_session for update; if coalesce(p_expected_version,0)<>coalesce(r.version,0) then raise exception 'stale_risk'; end if; insert into public.demo_risk_assessments(session_id,tester_id,patient_id,suicidal_ideation,intent,plan,self_harm,attempt_history,protective_factors,clinical_note) values(p_session,p_tester,s.patient_id,coalesce(p_risk->>'suicidal_ideation','not_assessed'),coalesce(p_risk->>'intent','not_assessed'),coalesce(p_risk->>'plan','not_assessed'),coalesce(p_risk->>'self_harm','not_assessed'),coalesce(p_risk->>'attempt_history','not_assessed'),coalesce(p_risk->>'protective_factors',''),coalesce(p_risk->>'clinical_note','')) on conflict(session_id) do update set suicidal_ideation=excluded.suicidal_ideation,intent=excluded.intent,plan=excluded.plan,self_harm=excluded.self_harm,attempt_history=excluded.attempt_history,protective_factors=excluded.protective_factors,clinical_note=excluded.clinical_note,version=demo_risk_assessments.version+1,updated_at=now() returning * into r; update public.demo_sessions set version=version+1,updated_at=now() where id=p_session; return r; end $$;

create or replace function public.demo_session_finalize(p_tester uuid,p_session uuid,p_expected_version integer) returns public.demo_sessions language plpgsql security definer set search_path=public as $$ declare s public.demo_sessions; missing text; begin select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update; if s.id is null then raise exception 'session_unavailable'; end if; if s.status='completed' then return s; end if; if p_expected_version is null or s.version<>p_expected_version then raise exception 'stale_session'; end if; select string_agg(u.section,', ') into missing from unnest(array['interview','mse','assessment','plan','review']) as u(section) where not exists(select 1 from public.demo_session_sections where session_id=p_session and section_key=u.section and length(trim(content))>0); if missing is not null then raise exception 'missing_sections:%',missing; end if; if not exists(select 1 from public.demo_risk_assessments where session_id=p_session and suicidal_ideation<>'not_assessed') then raise exception 'risk_required'; end if; update public.demo_sessions set status='completed',completed_at=now(),version=version+1,updated_at=now() where id=p_session returning * into s; return s; end $$;

alter table public.demo_clinical_entries
 add column if not exists tester_id uuid,
 add column if not exists patient_id uuid references public.demo_patients(id),
 add column if not exists session_id uuid references public.demo_sessions(id),
 add column if not exists model text,
 add column if not exists approved_by uuid,
 add column if not exists insertion_mode text,
 add column if not exists section_version integer;
create index if not exists demo_proposal_session on public.demo_clinical_entries(session_id);
create table public.demo_session_addenda(
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 tester_id uuid not null, actor_id uuid not null, patient_id uuid not null references public.demo_patients(id),
 session_id uuid not null references public.demo_sessions(id), kind text not null check(kind in ('addendum','correction')),
 reason text not null, content text not null check(length(trim(content))>0), created_at timestamptz not null default now()
);
alter table public.demo_session_addenda enable row level security;
create policy demo_read on public.demo_session_addenda for select using(true);
grant select on public.demo_session_addenda to anon,authenticated;

create or replace function public.demo_proposal_create(p_tester uuid,p_session uuid,p_section text,p_transcript text,p_proposal jsonb,p_model text)
returns public.demo_clinical_entries language plpgsql security definer set search_path=public as $$
declare s public.demo_sessions; r public.demo_clinical_entries;
begin
 select * into s from demo_sessions where id=p_session and tester_id=p_tester for update;
 if s.id is null or s.status<>'draft' then raise exception 'session_unavailable'; end if;
 if p_section is null or p_section not in ('interview','functioning','effects','adherence','mse','assessment','plan','review') or length(trim(coalesce(p_transcript,'')))<2 or length(p_transcript)>20000 or length(trim(coalesce(p_proposal->>'clinical_text','')))<1 then raise exception 'invalid_proposal'; end if;
 insert into demo_clinical_entries(tester_id,patient_id,session_id,patient_key,session_key,section_key,transcript,proposal,model)
 values(p_tester,s.patient_id,s.id,s.patient_id::text,s.id::text,p_section,p_transcript,p_proposal,p_model) returning * into r;
 return r;
end $$;

create or replace function public.demo_proposal_approve(p_tester uuid,p_id uuid,p_text text,p_mode text,p_expected_version integer)
returns public.demo_session_sections language plpgsql security definer set search_path=public as $$
declare p public.demo_clinical_entries; s public.demo_sessions; r public.demo_session_sections; content text;
begin
 select * into p from demo_clinical_entries where id=p_id and tester_id=p_tester;
 if p.id is null then raise exception 'proposal_not_found'; end if;
 select * into s from demo_sessions where id=p.session_id and tester_id=p_tester for update;
 select * into p from demo_clinical_entries where id=p_id for update;
 select * into r from demo_session_sections where session_id=s.id and section_key=p.section_key;
 if p.status='approved' then
  if p.approved_text is distinct from trim(p_text) or p.insertion_mode is distinct from p_mode then raise exception 'already_approved'; end if;
  return r;
 end if;
 if s.status<>'draft' then raise exception 'session_unavailable'; end if;
 if p_mode is null or p_mode not in ('append','replace') or length(trim(coalesce(p_text,'')))=0 then raise exception 'invalid_approval'; end if;
 if coalesce(r.version,0)<>coalesce(p_expected_version,0) then raise exception 'stale_section'; end if;
 content:=case when p_mode='append' and length(trim(coalesce(r.content,'')))>0 then r.content||E'\n\n'||trim(p_text) else trim(p_text) end;
 r:=demo_session_save_section(p_tester,s.id,p.section_key,content,'ai_proposal',p_expected_version);
 update demo_clinical_entries set status='approved',approved_text=trim(p_text),approved_at=now(),approved_by=p_tester,insertion_mode=p_mode,section_version=r.version where id=p.id;
 return r;
end $$;

create or replace function public.demo_addendum_create(p_tester uuid,p_session uuid,p_request uuid,p_kind text,p_reason text,p_content text)
returns public.demo_session_addenda language plpgsql security definer set search_path=public as $$
declare s public.demo_sessions; r public.demo_session_addenda;
begin
 select * into s from demo_sessions where id=p_session and tester_id=p_tester for update;
 if s.id is null or s.status<>'completed' then raise exception 'completed_session_required'; end if;
 select * into r from demo_session_addenda where request_id=p_request;
 if found then
  if r.tester_id<>p_tester or r.session_id<>p_session or r.content<>trim(p_content) or r.reason<>trim(p_reason) or r.kind<>p_kind then raise exception 'request_conflict'; end if;
  return r;
 end if;
 if length(trim(coalesce(p_reason,'')))=0 or length(trim(coalesce(p_content,'')))=0 then raise exception 'reason_and_content_required'; end if;
 insert into demo_session_addenda(request_id,tester_id,actor_id,patient_id,session_id,kind,reason,content) values(p_request,p_tester,p_tester,s.patient_id,s.id,p_kind,trim(p_reason),trim(p_content)) returning * into r;
 return r;
end $$;

create or replace function public.demo_immutable_entry() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'immutable_record'; end $$;
create trigger demo_addendum_immutable before update or delete on public.demo_session_addenda for each row execute function public.demo_immutable_entry();
create or replace function public.demo_approved_proposal_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if old.status='approved' and old.session_id is not null then raise exception 'immutable_record'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger demo_proposal_immutable before update or delete on public.demo_clinical_entries for each row execute function public.demo_approved_proposal_guard();
create or replace function public.demo_finalized_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_table_name='demo_sessions' then
  if old.status='completed' then raise exception 'immutable_record'; end if;
 elsif exists(select 1 from demo_sessions where id=old.session_id and status='completed') then raise exception 'immutable_record'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger demo_session_immutable before update or delete on public.demo_sessions for each row execute function public.demo_finalized_guard();
create trigger demo_section_immutable before update or delete on public.demo_session_sections for each row execute function public.demo_finalized_guard();
create trigger demo_risk_immutable before update or delete on public.demo_risk_assessments for each row execute function public.demo_finalized_guard();
-- Legacy approval API must not approve a proposal belonging to the canonical session workflow.
create or replace function public.demo_clinical_approve(p_id uuid,p_approved_text text) returns public.demo_clinical_entries language plpgsql security definer set search_path=public as $$
declare r public.demo_clinical_entries; begin
 update demo_clinical_entries set status='approved',approved_text=trim(p_approved_text),approved_at=now() where id=p_id and status='proposal' and session_id is null returning * into r;
 if r.id is null then raise exception 'proposal_not_found'; end if; return r; end $$;
revoke all on function public.demo_proposal_create(uuid,uuid,text,text,jsonb,text),public.demo_proposal_approve(uuid,uuid,text,text,integer),public.demo_addendum_create(uuid,uuid,uuid,text,text,text) from public;
grant execute on function public.demo_proposal_create(uuid,uuid,text,text,jsonb,text),public.demo_proposal_approve(uuid,uuid,text,text,integer),public.demo_addendum_create(uuid,uuid,uuid,text,text,text) to anon,authenticated;
create or replace function public.demo_session_start(p_tester uuid,p_patient uuid,p_type text) returns public.demo_sessions language plpgsql security definer set search_path=public as $$
declare r public.demo_sessions;
begin
 if p_type is null or p_type not in ('initial_assessment','follow_up') then raise exception 'invalid_session_type'; end if;
 perform 1 from demo_patients where id=p_patient and tester_id=p_tester for update;
 if not found then raise exception 'patient_not_found'; end if;
 select * into r from demo_sessions where patient_id=p_patient and tester_id=p_tester and status='draft' order by created_at desc limit 1;
 if r.id is null then insert into demo_sessions(tester_id,patient_id,session_type) values(p_tester,p_patient,p_type) returning * into r; end if;
 return r;
end $$;
