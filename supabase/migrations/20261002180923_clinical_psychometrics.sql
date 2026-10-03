-- Tokens and questionnaire responses are never directly readable through the public Data API.
create table private.demo_assessments(
 id uuid primary key, tester_id uuid not null, patient_id uuid not null references public.demo_patients(id),
 appointment_id uuid references public.demo_calendar_events(id), instrument text not null check(instrument in ('PHQ-9','GAD-7')),
 instrument_version text not null default 'el-demo-2026-10-v1', token_hash text not null unique,
 status text not null default 'assigned' check(status in ('assigned','opened','completed','revoked')),
 expires_at timestamptz not null, opened_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(),
 answers jsonb, score integer, item9_review boolean not null default false,
 provenance text not null default 'patient_link; server_scoring_v1'
);
alter table private.demo_assessments enable row level security;
revoke all on private.demo_assessments from public,anon,authenticated;
create index demo_assessment_patient on private.demo_assessments(tester_id,patient_id,created_at desc);
create or replace function public.demo_assessment_assign(p_tester uuid,p_patient uuid,p_appointment uuid,p_id uuid,p_instrument text,p_token text)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare r private.demo_assessments; h text;
begin
 if not exists(select 1 from demo_patients where id=p_patient and tester_id=p_tester) then raise exception 'patient_not_found'; end if;
 if p_appointment is not null and not exists(select 1 from demo_calendar_events where id=p_appointment and patient_id=p_patient and tester_id=p_tester and status='scheduled') then raise exception 'appointment_unavailable'; end if;
 if length(p_token)<43 or p_instrument not in ('PHQ-9','GAD-7') then raise exception 'invalid_assignment'; end if;
 h:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 insert into private.demo_assessments(id,tester_id,patient_id,appointment_id,instrument,token_hash,expires_at) values(p_id,p_tester,p_patient,p_appointment,p_instrument,h,now()+interval '14 days') on conflict(id) do nothing;
 select * into r from private.demo_assessments where id=p_id;
 if r.tester_id<>p_tester or r.patient_id<>p_patient or r.token_hash<>h or r.instrument<>p_instrument or r.appointment_id is distinct from p_appointment then raise exception 'request_conflict'; end if;
 return to_jsonb(r)-'token_hash';
end $$;
create or replace function public.demo_assessment_list(p_tester uuid,p_patient uuid) returns jsonb language sql security definer set search_path=public,private as $$
 select coalesce(jsonb_agg(to_jsonb(a)-'token_hash' order by created_at desc),'[]'::jsonb) from private.demo_assessments a where tester_id=p_tester and patient_id=p_patient
$$;
create or replace function public.demo_assessment_revoke(p_tester uuid,p_id uuid) returns void language plpgsql security definer set search_path=public,private as $$
begin update private.demo_assessments set status='revoked' where id=p_id and tester_id=p_tester and status in ('assigned','opened','revoked'); if not found then raise exception 'assignment_unavailable'; end if; end $$;
create or replace function public.demo_assessment_open(p_token text) returns jsonb language plpgsql security definer set search_path=public,private as $$
declare a private.demo_assessments;
begin
 select * into a from private.demo_assessments where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if a.id is null or a.status='revoked' then raise exception 'link_unavailable'; end if;
 if a.status='completed' then return jsonb_build_object('id',a.id,'status','completed'); end if;
 if a.expires_at<=now() then raise exception 'link_expired'; end if;
 update private.demo_assessments set status='opened',opened_at=coalesce(opened_at,now()) where id=a.id;
 return jsonb_build_object('id',a.id,'instrument',a.instrument,'instrument_version',a.instrument_version,'status','opened','expires_at',a.expires_at);
end $$;
create or replace function public.demo_assessment_submit(p_token text,p_answers jsonb) returns jsonb language plpgsql security definer set search_path=public,private as $$
declare a private.demo_assessments; n integer; computed_score integer;
begin
 select * into a from private.demo_assessments where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if a.id is null or a.status='revoked' then raise exception 'link_unavailable'; end if;
 if a.status='completed' then
  if a.answers is distinct from p_answers then raise exception 'already_completed'; end if;
  return jsonb_build_object('id',a.id,'status','completed');
 end if;
 if a.expires_at<=now() then raise exception 'link_expired'; end if;
 n:=case when a.instrument='PHQ-9' then 9 else 7 end;
 if p_answers is null or jsonb_typeof(p_answers)<>'array' then raise exception 'invalid_answers'; end if;
 if jsonb_array_length(p_answers)<>n then raise exception 'invalid_answers'; end if;
 if exists(select 1 from jsonb_array_elements(p_answers) x where jsonb_typeof(x)<>'number' or x::text not in ('0','1','2','3')) then raise exception 'invalid_answers'; end if;
 select sum((x::text)::integer) into computed_score from jsonb_array_elements(p_answers) x;
 update private.demo_assessments set answers=p_answers,score=computed_score,item9_review=(a.instrument='PHQ-9' and (p_answers->>8)::integer>0),status='completed',completed_at=now() where id=a.id;
 return jsonb_build_object('id',a.id,'status','completed');
end $$;
-- Row locking makes retries idempotent; no caller-provided score or clinical risk value is accepted.
revoke all on function public.demo_assessment_assign(uuid,uuid,uuid,uuid,text,text),public.demo_assessment_list(uuid,uuid),public.demo_assessment_revoke(uuid,uuid),public.demo_assessment_open(text),public.demo_assessment_submit(text,jsonb) from public;
grant execute on function public.demo_assessment_assign(uuid,uuid,uuid,uuid,text,text),public.demo_assessment_list(uuid,uuid),public.demo_assessment_revoke(uuid,uuid),public.demo_assessment_open(text),public.demo_assessment_submit(text,jsonb) to anon,authenticated;
