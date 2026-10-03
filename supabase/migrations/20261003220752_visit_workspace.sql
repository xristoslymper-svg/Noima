-- Extend canonical sections and structured risk; no parallel clinical tables.
alter table public.demo_session_sections add column document jsonb;
alter table public.demo_risk_assessments add column harm_to_others text not null default 'not_assessed' check(harm_to_others in ('not_assessed','unknown','negative','positive'));
create or replace function public.demo_session_save_risk(p_tester uuid,p_session uuid,p_risk jsonb,p_expected_version integer default null) returns public.demo_risk_assessments language plpgsql security definer set search_path=public as $$ declare s public.demo_sessions; r public.demo_risk_assessments; begin select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update; if s.id is null or s.status<>'draft' then raise exception 'session_unavailable'; end if; select * into r from public.demo_risk_assessments where session_id=p_session for update; if coalesce(p_expected_version,0)<>coalesce(r.version,0) then raise exception 'stale_risk'; end if; insert into public.demo_risk_assessments(session_id,tester_id,patient_id,suicidal_ideation,intent,plan,self_harm,attempt_history,harm_to_others,protective_factors,clinical_note) values(p_session,p_tester,s.patient_id,coalesce(p_risk->>'suicidal_ideation','not_assessed'),coalesce(p_risk->>'intent','not_assessed'),coalesce(p_risk->>'plan','not_assessed'),coalesce(p_risk->>'self_harm','not_assessed'),coalesce(p_risk->>'attempt_history','not_assessed'),coalesce(p_risk->>'harm_to_others',r.harm_to_others,'not_assessed'),coalesce(p_risk->>'protective_factors',''),coalesce(p_risk->>'clinical_note','')) on conflict(session_id) do update set suicidal_ideation=excluded.suicidal_ideation,intent=excluded.intent,plan=excluded.plan,self_harm=excluded.self_harm,attempt_history=excluded.attempt_history,harm_to_others=excluded.harm_to_others,protective_factors=excluded.protective_factors,clinical_note=excluded.clinical_note,version=demo_risk_assessments.version+1,updated_at=now() returning * into r; update public.demo_sessions set version=version+1,updated_at=now() where id=p_session; return r; end $$;
create or replace function private.visit_document_text(p_section text,p_document jsonb) returns text language plpgsql immutable set search_path=pg_catalog as $$
declare f jsonb; c jsonb; result text:=''; line text; code_text text; keys text[]:=array[]::text[];
begin
 if p_section is null or p_section not in ('mse','assessment') or jsonb_typeof(p_document) is distinct from 'object' or p_document->>'kind' is distinct from p_section or jsonb_typeof(p_document->'fields') is distinct from 'array' or jsonb_array_length(p_document->'fields')>50 or length(p_document::text)>100000 then raise exception 'invalid_document'; end if;
 for f in select value from jsonb_array_elements(p_document->'fields') loop
  if jsonb_typeof(f->'text') is distinct from 'string' or jsonb_typeof(f->'key') is distinct from 'string' or jsonb_typeof(f->'label') is distinct from 'string' or length(f->>'label')>160 or f->>'key'=any(keys) then raise exception 'invalid_document'; end if;
  keys:=array_append(keys,f->>'key');
  if p_section='mse' and f->>'key' not in ('appearance','speech','mood','affect','thought_process','thought_content','perception','cognition','insight','judgment','impulse_control','reliability','legacy') then raise exception 'invalid_document'; end if;
  if p_section='assessment' and f->>'key' not in ('diagnosis','formulation','impression','legacy') and f->>'key' not like 'differential-%' then raise exception 'invalid_document'; end if;
  if f ? 'status' and f->>'status' not in ('provisional','under_investigation','confirmed') then raise exception 'invalid_document'; end if;
  code_text:='';
  if f ? 'codes' then
   if jsonb_typeof(f->'codes') is distinct from 'array' or jsonb_array_length(f->'codes')>30 then raise exception 'invalid_document'; end if;
   for c in select value from jsonb_array_elements(f->'codes') loop
    if jsonb_typeof(c->'code') is distinct from 'string' or c->>'code' !~ '^[A-Z][0-9]{2}(\.[0-9A-Z]+)?$' or c->>'system' is distinct from 'WHO ICD-10' or c->>'edition' is distinct from '2019' or jsonb_typeof(c->'label') is distinct from 'string' then raise exception 'invalid_document'; end if;
    code_text:=concat_ws('; ',nullif(code_text,''),(c->>'code')||' · '||(c->>'label')||' (WHO ICD-10 2019)');
   end loop;
  end if;
  if length(trim(f->>'text'))>0 or code_text<>'' then
   line:=(f->>'label')||case f->>'status' when 'provisional' then ' — προσωρινή' when 'under_investigation' then ' — υπό διερεύνηση' when 'confirmed' then ' — επιβεβαιωμένη' else '' end||': '||(f->>'text');
   if code_text<>'' then line:=line||E'\n'||code_text; end if;
   result:=concat_ws(E'\n\n',nullif(result,''),line);
  end if;
 end loop;
 return result;
end $$;
revoke all on function private.visit_document_text(text,jsonb) from public,anon,authenticated;

-- The readable content is a projection of the same document. Generic manual/AI
-- replacement clears old structure instead of leaving a competing stale value.
create or replace function private.guard_visit_document() returns trigger language plpgsql security definer set search_path=public,private as $$
begin
 if new.document is not null then
  if TG_OP='UPDATE' and new.document is not distinct from old.document and new.content is distinct from old.content then new.document:=null;
  else new.content:=private.visit_document_text(new.section_key,new.document); end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_visit_document() from public,anon,authenticated;
create trigger demo_document_projection before insert or update on public.demo_session_sections for each row execute function private.guard_visit_document();

create or replace function public.demo_session_save_document(p_tester uuid,p_session uuid,p_section text,p_document jsonb,p_expected_version integer default null)
returns public.demo_session_sections language plpgsql security definer set search_path=public,private as $$
declare s public.demo_sessions; r public.demo_session_sections; rendered text;
begin
 select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
 if s.id is null or s.status<>'draft' then raise exception 'session_unavailable'; end if;
 rendered:=private.visit_document_text(p_section,p_document);
 select * into r from public.demo_session_sections where session_id=p_session and section_key=p_section for update;
 if coalesce(p_expected_version,0)<>coalesce(r.version,0) then raise exception 'stale_section'; end if;
 if r.id is null then
  insert into public.demo_session_sections(tester_id,patient_id,session_id,section_key,content,source,document) values(p_tester,s.patient_id,p_session,p_section,rendered,'manual',p_document) returning * into r;
 else
  update public.demo_session_sections set document=p_document,content=rendered,source='manual',version=version+1,updated_at=now() where id=r.id returning * into r;
 end if;
 update public.demo_sessions set version=version+1,updated_at=now() where id=p_session;
 return r;
end $$;
revoke all on function public.demo_session_save_document(uuid,uuid,text,jsonb,integer) from public;
grant execute on function public.demo_session_save_document(uuid,uuid,text,jsonb,integer) to anon,authenticated;
-- Historical exposure is written as start + stop in one transaction.
create or replace function public.demo_medication_record_history(p_tester uuid,p_patient uuid,p_session uuid,p_name text,p_dose numeric,p_unit text,p_frequency text,p_started date,p_stopped date,p_reason text default '') returns public.demo_medications language plpgsql security definer set search_path=public as $$
declare m public.demo_medications;
begin
 if p_started is null or p_stopped is null or p_stopped<p_started or p_stopped>(now() at time zone 'Europe/Athens')::date then raise exception 'invalid_medication_history'; end if;
 m:=public.demo_medication_start(p_tester,p_patient,p_session,p_name,p_dose,p_unit,p_frequency,p_started,p_reason);
 return public.demo_medication_event_write(p_tester,m.id,p_session,'stopped',null,null,null,p_stopped,p_reason,m.plan_version);
end $$;
revoke all on function public.demo_medication_record_history(uuid,uuid,uuid,text,numeric,text,text,date,date,text) from public;
grant execute on function public.demo_medication_record_history(uuid,uuid,uuid,text,numeric,text,text,date,date,text) to anon,authenticated;
