-- Historical clinical measurements are not questionnaire assignments or visits.
-- The administration date, actual entry time and approving clinician stay separate.
create table private.demo_historical_measurements (
 id uuid primary key,
 tester_id uuid not null,
 patient_id uuid not null references public.demo_patients(id),
 instrument text not null check (instrument in ('PHQ-9','GAD-7')),
 instrument_version text not null default 'not_recorded',
 score integer not null,
 administered_on date not null check (administered_on >= date '1900-01-01'),
 source text not null check (source in ('historical_manual','historical_scan')),
 answers integer[],
 note text not null default '' check (length(note)<=2000),
 document_ids uuid[] not null default '{}',
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 confirmed_at timestamptz not null default now(),
 supersedes_id uuid unique references private.demo_historical_measurements(id),
 correction_reason text not null default '' check (length(correction_reason)<=500),
 check (score between 0 and case instrument when 'PHQ-9' then 27 else 21 end),
 check (source <> 'historical_manual' or answers is null),
 check (source <> 'historical_scan' or cardinality(document_ids)>0),
 check (supersedes_id is null or length(trim(correction_reason))>0)
);
create index historical_measurement_patient_date on private.demo_historical_measurements(tester_id,patient_id,administered_on desc);
alter table private.demo_historical_measurements enable row level security;
revoke all on private.demo_historical_measurements from public,anon,authenticated;
create policy historical_measurement_owner on private.demo_historical_measurements to authenticated
 using (private.pilot_owns(tester_id)) with check (private.pilot_owns(tester_id));

create function private.demo_historical_measurement_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'historical_measurement_immutable'; end $$;
create trigger historical_measurement_immutable before update or delete on private.demo_historical_measurements
 for each row execute function private.demo_historical_measurement_immutable();
revoke all on function private.demo_historical_measurement_immutable() from public,anon,authenticated;

create function public.demo_historical_measurement_list(p_tester uuid,p_patient uuid)
returns setof private.demo_historical_measurements language plpgsql security definer set search_path='' as $$
begin
 perform private.pilot_assert_owner(p_tester);
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if not exists(select 1 from public.demo_patients where id=p_patient and tester_id=p_tester)
 then raise exception 'patient_not_found'; end if;
 return query select m.* from private.demo_historical_measurements m
 where m.tester_id=p_tester and m.patient_id=p_patient
 and not exists(select 1 from private.demo_historical_measurements c where c.supersedes_id=m.id)
 order by m.administered_on desc,m.created_at desc,m.id;
end $$;

create function private.demo_historical_measurement_save(
 p_tester uuid,p_patient uuid,p_request uuid,p_instrument text,p_score integer,p_administered_on date,
 p_note text default '',p_source text default 'historical_manual',p_answers integer[] default null,
 p_document_ids uuid[] default '{}',p_supersedes uuid default null,p_reason text default ''
) returns private.demo_historical_measurements language plpgsql security definer set search_path='' as $$
declare r private.demo_historical_measurements; previous private.demo_historical_measurements; document_id uuid;
begin
 perform private.pilot_assert_owner(p_tester);
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_request is null or p_instrument is null or p_instrument not in ('PHQ-9','GAD-7')
 or p_score is null or p_score<0 or p_score>(case p_instrument when 'PHQ-9' then 27 else 21 end)
 or p_administered_on is null or p_administered_on<date '1900-01-01'
 or p_administered_on>(now() at time zone 'Europe/Athens')::date
 or p_source is null or p_source not in ('historical_manual','historical_scan')
 or length(coalesce(p_note,''))>2000 or length(coalesce(p_reason,''))>500
 or p_document_ids is null or cardinality(p_document_ids)>8 or array_position(p_document_ids,null) is not null
 then raise exception 'invalid_historical_measurement'; end if;
 if p_source='historical_manual' and p_answers is not null then raise exception 'total_only_measurement'; end if;
 if p_source='historical_scan' and cardinality(p_document_ids)=0 then raise exception 'document_required'; end if;
 if p_answers is not null then
  if array_ndims(p_answers) is distinct from 1 or array_lower(p_answers,1)<>1
  or cardinality(p_answers)<>(case p_instrument when 'PHQ-9' then 9 else 7 end)
  or exists(select 1 from unnest(p_answers) a where a is null or a<0 or a>3)
  or (select sum(a) from unnest(p_answers) a) is distinct from p_score
  then raise exception 'invalid_historical_answers'; end if;
 end if;
 -- A lock serializes retries and competing corrections for this patient.
 perform 1 from public.demo_patients where id=p_patient and tester_id=p_tester for update;
 if not found then raise exception 'patient_not_found'; end if;
 select * into r from private.demo_historical_measurements where id=p_request;
 if found then
  if r.tester_id<>p_tester or r.patient_id<>p_patient or r.instrument<>p_instrument
  or r.score<>p_score or r.administered_on<>p_administered_on or r.source<>p_source
  or r.note is distinct from trim(coalesce(p_note,'')) or r.answers is distinct from p_answers
  or r.document_ids is distinct from p_document_ids or r.supersedes_id is distinct from p_supersedes
  or r.correction_reason is distinct from trim(coalesce(p_reason,''))
  then raise exception 'measurement_request_conflict'; end if;
  return r;
 end if;
 -- Document storage is introduced by the following migration. The lookup is
 -- executed only for linked documents, after all migrations have been applied.
 foreach document_id in array p_document_ids loop
  if not exists(select 1 from private.demo_patient_documents d
   where d.id=document_id and d.tester_id=p_tester and d.patient_id=p_patient and d.state='ready')
  then raise exception 'document_not_found'; end if;
 end loop;
 if p_supersedes is not null then
  select * into previous from private.demo_historical_measurements
   where id=p_supersedes and tester_id=p_tester and patient_id=p_patient;
  if not found or previous.source<>p_source or previous.instrument<>p_instrument
   or length(trim(coalesce(p_reason,'')))=0 then raise exception 'invalid_measurement_correction'; end if;
  if exists(select 1 from private.demo_historical_measurements where supersedes_id=p_supersedes)
   then raise exception 'stale_measurement'; end if;
 end if;
 insert into private.demo_historical_measurements
  (id,tester_id,patient_id,instrument,score,administered_on,source,answers,note,document_ids,actor_id,supersedes_id,correction_reason)
 values(p_request,p_tester,p_patient,p_instrument,p_score,p_administered_on,p_source,p_answers,
  trim(coalesce(p_note,'')),p_document_ids,auth.uid(),p_supersedes,trim(coalesce(p_reason,''))) returning * into r;
 delete from public.demo_clinical_summary_cache where tester_id=p_tester and patient_id=p_patient;
 return r;
end $$;
-- Only the reviewed scan transaction may save scanned item-level evidence.
revoke all on function private.demo_historical_measurement_save(uuid,uuid,uuid,text,integer,date,text,text,integer[],uuid[],uuid,text)
 from public,anon,authenticated;

create function public.demo_historical_measurement_save(
 p_tester uuid,p_patient uuid,p_request uuid,p_instrument text,p_score integer,p_administered_on date,
 p_note text default '',p_source text default 'historical_manual',p_answers integer[] default null,
 p_document_ids uuid[] default '{}',p_supersedes uuid default null,p_reason text default ''
) returns private.demo_historical_measurements language plpgsql security definer set search_path='' as $$
begin
 if p_source is distinct from 'historical_manual' then raise exception 'invalid_measurement_source'; end if;
 return private.demo_historical_measurement_save(p_tester,p_patient,p_request,p_instrument,p_score,p_administered_on,
  p_note,'historical_manual',p_answers,p_document_ids,p_supersedes,p_reason);
end $$;
revoke all on function public.demo_historical_measurement_list(uuid,uuid),
 public.demo_historical_measurement_save(uuid,uuid,uuid,text,integer,date,text,text,integer[],uuid[],uuid,text) from public,anon;
grant execute on function public.demo_historical_measurement_list(uuid,uuid),
 public.demo_historical_measurement_save(uuid,uuid,uuid,text,integer,date,text,text,integer[],uuid[],uuid,text) to authenticated;
