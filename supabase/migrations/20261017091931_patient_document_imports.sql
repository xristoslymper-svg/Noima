-- Private original documents and clinician-approved historical imports.
-- These records never create an encounter, prescription or diagnosis.
create table private.demo_patient_documents (
 id uuid primary key,
 tester_id uuid not null,
 patient_id uuid not null references public.demo_patients(id),
 state text not null default 'pending' check(state in ('pending','ready')),
 object_name text not null unique,
 original_name text not null check(length(original_name) between 1 and 200),
 title text not null default '' check(length(title)<=200),
 category text check(category in ('discharge','opinion','tests','history','other')),
 document_date date,
 media_type text not null check(media_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 byte_size bigint not null check(byte_size between 1 and 3145728),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 ready_at timestamptz,
 check((state='ready')=(ready_at is not null))
);
create index patient_documents_lookup on private.demo_patient_documents(tester_id,patient_id,created_at desc);
alter table private.demo_patient_documents enable row level security;
revoke all on private.demo_patient_documents from public,anon,authenticated;
create policy patient_document_owner on private.demo_patient_documents to authenticated
 using(private.pilot_owns(tester_id)) with check(private.pilot_owns(tester_id));

create table private.demo_document_audit (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references private.demo_patient_documents(id),
 tester_id uuid not null,
 patient_id uuid not null,
 action text not null check(action in ('uploaded','preview','download','scan','approved')),
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table private.demo_document_audit enable row level security;
revoke all on private.demo_document_audit from public,anon,authenticated;
create policy document_audit_owner on private.demo_document_audit to authenticated
 using(private.pilot_owns(tester_id));

create function private.demo_document_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.state='pending' and new.state='ready'
    and (to_jsonb(old)-'state'-'ready_at')=(to_jsonb(new)-'state'-'ready_at') then return new; end if;
 raise exception 'document_immutable';
end $$;
create trigger patient_document_immutable before update or delete on private.demo_patient_documents
 for each row execute function private.demo_document_guard();
create function private.demo_import_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'document_import_immutable'; end $$;
create trigger document_audit_immutable before update or delete on private.demo_document_audit
 for each row execute function private.demo_import_immutable();
revoke all on function private.demo_document_guard(),private.demo_import_immutable() from public,anon,authenticated;

create function public.demo_document_stage(p_tester uuid,p_patient uuid,p_id uuid,p_meta jsonb)
returns private.demo_patient_documents language plpgsql security definer set search_path='' as $$
declare r private.demo_patient_documents; extension text; date_value date;
begin
 perform private.pilot_assert_owner(p_tester);
 if p_id is null or jsonb_typeof(p_meta) is distinct from 'object'
    or coalesce(p_meta->>'media_type','') not in ('application/pdf','image/jpeg','image/png','image/webp')
    or coalesce(p_meta->>'sha256','') !~ '^[0-9a-f]{64}$'
    or coalesce(p_meta->>'byte_size','') !~ '^[0-9]+$'
    or (p_meta->>'byte_size')::bigint not between 1 and 3145728
    or length(coalesce(p_meta->>'original_name','')) not between 1 and 200
    or (p_meta->>'original_name') ~ '[[:cntrl:]/]' or position(chr(92) in (p_meta->>'original_name'))>0
    or length(coalesce(p_meta->>'title',''))>200
    or coalesce(p_meta->>'category','') not in ('','discharge','opinion','tests','history','other')
 then raise exception 'invalid_document'; end if;
 if nullif(p_meta->>'document_date','') is not null then
  if (p_meta->>'document_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_document'; end if;
  date_value:=(p_meta->>'document_date')::date;
 end if;
 perform 1 from public.demo_patients where id=p_patient and tester_id=p_tester for update;
 if not found then raise exception 'patient_not_found'; end if;
 select * into r from private.demo_patient_documents where id=p_id;
 if found then
  if r.tester_id<>p_tester or r.patient_id<>p_patient or r.sha256 is distinct from p_meta->>'sha256'
     or r.byte_size is distinct from (p_meta->>'byte_size')::bigint or r.media_type is distinct from p_meta->>'media_type'
     or r.original_name is distinct from p_meta->>'original_name' or r.title is distinct from trim(coalesce(p_meta->>'title',''))
     or r.category is distinct from nullif(p_meta->>'category','') or r.document_date is distinct from date_value
  then raise exception 'document_request_conflict'; end if;
  return r;
 end if;
 extension:=case p_meta->>'media_type' when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
 insert into private.demo_patient_documents(id,tester_id,patient_id,object_name,original_name,title,category,document_date,media_type,byte_size,sha256,actor_id)
 values(p_id,p_tester,p_patient,p_tester::text||'/'||p_patient::text||'/'||p_id::text||'.'||extension,p_meta->>'original_name',trim(coalesce(p_meta->>'title','')),nullif(p_meta->>'category',''),date_value,p_meta->>'media_type',(p_meta->>'byte_size')::bigint,p_meta->>'sha256',auth.uid()) returning * into r;
 return r;
end $$;

-- Storage checks an exact reserved object name, not a caller-controlled folder prefix.
create function private.demo_document_storage_allowed(p_name text,p_upload boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.demo_patient_documents d
  join public.demo_patients p on p.id=d.patient_id and p.tester_id=d.tester_id
  where d.object_name=p_name and private.pilot_owns(d.tester_id)
    and (not p_upload or d.state='pending'))
$$;
revoke all on function private.demo_document_storage_allowed(text,boolean) from public,anon;
grant execute on function private.demo_document_storage_allowed(text,boolean) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('patient-documents','patient-documents',false,3145728,array['application/pdf','image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy patient_documents_storage_insert on storage.objects for insert to authenticated
 with check(bucket_id='patient-documents' and private.demo_document_storage_allowed(name,true));
create policy patient_documents_storage_select on storage.objects for select to authenticated
 using(bucket_id='patient-documents' and private.demo_document_storage_allowed(name,false));
-- No UPDATE, DELETE, public URL, or anonymous storage policy: originals are immutable.

create function public.demo_document_complete(p_tester uuid,p_patient uuid,p_id uuid)
returns private.demo_patient_documents language plpgsql security definer set search_path='' as $$
declare r private.demo_patient_documents;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into r from private.demo_patient_documents where id=p_id and tester_id=p_tester and patient_id=p_patient for update;
 if not found then raise exception 'document_not_found'; end if;
 if r.state='ready' then return r; end if;
 if not exists(select 1 from storage.objects where bucket_id='patient-documents' and name=r.object_name
  and (metadata->>'size')::bigint=r.byte_size and metadata->>'mimetype'=r.media_type)
 then raise exception 'document_upload_incomplete'; end if;
 update private.demo_patient_documents set state='ready',ready_at=now() where id=r.id returning * into r;
 insert into private.demo_document_audit(document_id,tester_id,patient_id,action,actor_id)
 values(r.id,r.tester_id,r.patient_id,'uploaded',auth.uid());
 return r;
end $$;

create function public.demo_document_list(p_tester uuid,p_patient uuid)
returns setof private.demo_patient_documents language plpgsql security definer set search_path='' as $$
begin
 perform private.pilot_assert_owner(p_tester);
 if not exists(select 1 from public.demo_patients where id=p_patient and tester_id=p_tester) then raise exception 'patient_not_found'; end if;
 return query select * from private.demo_patient_documents where tester_id=p_tester and patient_id=p_patient and state='ready' order by created_at desc,id;
end $$;
create function public.demo_document_get(p_tester uuid,p_patient uuid,p_id uuid,p_action text default 'preview')
returns private.demo_patient_documents language plpgsql security definer set search_path='' as $$
declare r private.demo_patient_documents;
begin
 perform private.pilot_assert_owner(p_tester);
 if p_action is null or p_action not in ('preview','download','scan') then raise exception 'invalid_document_action'; end if;
 select * into r from private.demo_patient_documents where id=p_id and tester_id=p_tester and patient_id=p_patient and state='ready';
 if not found then raise exception 'document_not_found'; end if;
 insert into private.demo_document_audit(document_id,tester_id,patient_id,action,actor_id) values(r.id,r.tester_id,r.patient_id,p_action,auth.uid());
 return r;
end $$;

create table private.demo_document_scans (
 id uuid primary key,
 tester_id uuid not null,
 patient_id uuid not null references public.demo_patients(id),
 document_ids uuid[] not null check(cardinality(document_ids) between 1 and 6),
 state text not null check(state in ('extracting','failed','ready','approved')),
 attempt_id uuid not null,
 extracted jsonb,
 review jsonb,
 result jsonb,
 actor_id uuid not null references auth.users(id),
 approved_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 approved_at timestamptz,
 check((state='approved')=(approved_at is not null))
);
alter table private.demo_document_scans enable row level security;
revoke all on private.demo_document_scans from public,anon,authenticated;
create policy document_scan_owner on private.demo_document_scans to authenticated
 using(private.pilot_owns(tester_id)) with check(private.pilot_owns(tester_id));
create function private.demo_document_scan_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.state='approved' or old.id<>new.id or old.tester_id<>new.tester_id or old.patient_id<>new.patient_id or old.document_ids<>new.document_ids
    or old.actor_id<>new.actor_id or old.created_at<>new.created_at or (old.extracted is not null and old.extracted is distinct from new.extracted)
 then raise exception 'scan_immutable'; end if;
 return new;
end $$;
create trigger document_scan_guard before update or delete on private.demo_document_scans for each row execute function private.demo_document_scan_guard();
revoke all on function private.demo_document_scan_guard() from public,anon,authenticated;

create function public.demo_document_scan_start(p_tester uuid,p_patient uuid,p_request uuid,p_documents uuid[],p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.demo_document_scans;
begin
 perform private.pilot_assert_owner(p_tester);
 if p_request is null or p_attempt is null or p_documents is null or cardinality(p_documents) not between 1 and 6 then raise exception 'invalid_scan'; end if;
 perform 1 from public.demo_patients where id=p_patient and tester_id=p_tester for update;
 if not found then raise exception 'patient_not_found'; end if;
 if (select count(*) from private.demo_patient_documents where id=any(p_documents) and tester_id=p_tester and patient_id=p_patient and state='ready')<>cardinality(p_documents) then raise exception 'document_not_found'; end if;
 select * into r from private.demo_document_scans where id=p_request for update;
 if found then
  if r.tester_id<>p_tester or r.patient_id<>p_patient or r.document_ids is distinct from p_documents then raise exception 'scan_request_conflict'; end if;
  if r.state in ('ready','approved') or (r.state='extracting' and r.updated_at>now()-interval '2 minutes') then return jsonb_build_object('scan',to_jsonb(r),'acquired',false); end if;
  update private.demo_document_scans set state='extracting',attempt_id=p_attempt,updated_at=now() where id=r.id returning * into r;
 else
  insert into private.demo_document_scans(id,tester_id,patient_id,document_ids,state,attempt_id,actor_id)
   values(p_request,p_tester,p_patient,p_documents,'extracting',p_attempt,auth.uid()) returning * into r;
 end if;
 return jsonb_build_object('scan',to_jsonb(r),'acquired',true);
end $$;
create function public.demo_document_scan_finish(p_tester uuid,p_patient uuid,p_request uuid,p_attempt uuid,p_extracted jsonb)
returns private.demo_document_scans language plpgsql security definer set search_path='' as $$
declare r private.demo_document_scans;
begin
 perform private.pilot_assert_owner(p_tester);
 if p_extracted is not null and (jsonb_typeof(p_extracted)<>'object' or coalesce(p_extracted->>'kind','') not in ('PHQ-9','GAD-7','history','unknown') or length(p_extracted::text)>50000) then raise exception 'invalid_scan_result'; end if;
 update private.demo_document_scans set state=case when p_extracted is null then 'failed' else 'ready' end,extracted=p_extracted,updated_at=now()
  where id=p_request and tester_id=p_tester and patient_id=p_patient and attempt_id=p_attempt and state='extracting' returning * into r;
 if not found then raise exception 'stale_scan_attempt'; end if;
 return r;
end $$;
create function public.demo_document_scan_get(p_tester uuid,p_patient uuid,p_request uuid)
returns private.demo_document_scans language plpgsql security definer set search_path='' as $$
declare r private.demo_document_scans;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into r from private.demo_document_scans where id=p_request and tester_id=p_tester and patient_id=p_patient;
 if not found then raise exception 'scan_not_found'; end if;
 return r;
end $$;

create table private.demo_history_imports (
 id uuid primary key default gen_random_uuid(),
 scan_id uuid not null unique references private.demo_document_scans(id),
 tester_id uuid not null,
 patient_id uuid not null references public.demo_patients(id),
 document_ids uuid[] not null,
 additions jsonb not null,
 before_history jsonb not null,
 history_version integer not null,
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table private.demo_history_imports enable row level security;
revoke all on private.demo_history_imports from public,anon,authenticated;
create policy history_import_owner on private.demo_history_imports to authenticated using(private.pilot_owns(tester_id));
create trigger history_import_immutable before update or delete on private.demo_history_imports for each row execute function private.demo_import_immutable();
create function public.demo_history_import_list(p_tester uuid,p_patient uuid)
returns setof private.demo_history_imports language plpgsql security definer set search_path='' as $$
begin
 perform private.pilot_assert_owner(p_tester);
 if not exists(select 1 from public.demo_patients where id=p_patient and tester_id=p_tester) then raise exception 'patient_not_found'; end if;
 return query select * from private.demo_history_imports where tester_id=p_tester and patient_id=p_patient order by created_at,id;
end $$;

create function private.demo_import_normalized_text(p_value text)
returns text language sql immutable set search_path='' as $$
 select lower(regexp_replace(regexp_replace(trim(replace(coalesce(p_value,''),E'\r\n',E'\n')),E'\n[ \t]*\n+',chr(30),'g'),'[[:space:]]+',' ','g'))
$$;
create function private.demo_history_has_import(p_current text,p_text text)
returns boolean language sql immutable set search_path='' as $$
 select exists(select 1 from unnest(array[p_text,'Αναφορά ασθενούς σε έγγραφο: '||p_text,'Από έγγραφο: '||p_text]) candidate
  where position(chr(30)||private.demo_import_normalized_text(candidate)||chr(30) in chr(30)||private.demo_import_normalized_text(p_current)||chr(30))>0)
$$;
revoke all on function private.demo_import_normalized_text(text),private.demo_history_has_import(text,text) from public,anon,authenticated;

create function public.demo_document_scan_commit(p_tester uuid,p_patient uuid,p_request uuid,p_review jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.demo_document_scans; h public.demo_patient_history; before_value jsonb; patch jsonb; item jsonb; key text;
 answer_values integer[]; result_value jsonb; count_keys integer:=0; seen_keys text[]:='{}'; effective_additions jsonb:='[]';
begin
 perform private.pilot_assert_owner(p_tester);
 perform 1 from public.demo_patients where id=p_patient and tester_id=p_tester for update;
 if not found then raise exception 'patient_not_found'; end if;
 select * into s from private.demo_document_scans where id=p_request and tester_id=p_tester and patient_id=p_patient for update;
 if not found then raise exception 'scan_not_found'; end if;
 if s.state='approved' then
  if s.review is distinct from p_review then raise exception 'scan_request_conflict'; end if;
  return s.result;
 end if;
 if s.state<>'ready' or jsonb_typeof(p_review) is distinct from 'object' or p_review->>'kind' is distinct from s.extracted->>'kind'
   or (s.extracted->>'patient_identity_check'='true' and coalesce(p_review->>'patient_confirmed','false')<>'true')
 then raise exception 'invalid_scan_review'; end if;
 if (select count(*) from private.demo_patient_documents where id=any(s.document_ids) and tester_id=p_tester and patient_id=p_patient and state='ready')<>cardinality(s.document_ids) then raise exception 'document_not_found'; end if;
 if p_review->>'kind' in ('PHQ-9','GAD-7') then
  if jsonb_typeof(p_review->'answers')='array' then
   if exists(select 1 from jsonb_array_elements(p_review->'answers') a where jsonb_typeof(a)<>'number' or a::text !~ '^[0-3]$') then raise exception 'invalid_scan_review'; end if;
   select array_agg(value::text::integer order by ordinality) into answer_values from jsonb_array_elements(p_review->'answers') with ordinality;
  elsif p_review->'answers' is distinct from 'null'::jsonb then raise exception 'invalid_scan_review'; end if;
  if coalesce(p_review->>'score','') !~ '^[0-9]+$' or coalesce(p_review->>'administered_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_scan_review'; end if;
  select to_jsonb(m) into result_value from private.demo_historical_measurement_save(p_tester,p_patient,p_request,p_review->>'kind',(p_review->>'score')::integer,(p_review->>'administered_on')::date,coalesce(p_review->>'note',''),'historical_scan',answer_values,s.document_ids) m;
  result_value:=jsonb_build_object('measurement',result_value);
 elsif p_review->>'kind'='history' then
  if jsonb_typeof(p_review->'additions') is distinct from 'array' or jsonb_array_length(p_review->'additions') not between 1 and 8
     or coalesce(p_review->>'expected_history_version','') !~ '^[0-9]+$' then raise exception 'invalid_scan_review'; end if;
  select * into h from public.demo_patient_history where patient_id=p_patient and tester_id=p_tester for update;
  before_value:=coalesce(to_jsonb(h),'{}'::jsonb);
  patch:=before_value;
  for item in select value from jsonb_array_elements(p_review->'additions') loop
   key:=item->>'field';
   if key is null or key not in ('psychiatric_history','medical_history','previous_treatments','hospitalizations','family_history','substance_history','social_functioning','allergies')
      or key=any(seen_keys) or length(trim(coalesce(item->>'text',''))) not between 1 and 4000
      or coalesce(item->>'attribution','') not in ('document','patient_reported') or length(trim(coalesce(s.extracted->'history'->key->>'text','')))=0
   then raise exception 'invalid_scan_review'; end if;
   seen_keys:=array_append(seen_keys,key);
   if private.demo_history_has_import(before_value->>key,item->>'text') then continue; end if;
   count_keys:=count_keys+1;effective_additions:=effective_additions||jsonb_build_array(item);
   patch:=jsonb_set(patch,array[key],to_jsonb(concat_ws(E'\n\n',nullif(trim(before_value->>key),''),(case when item->>'attribution'='patient_reported' then 'Αναφορά ασθενούς σε έγγραφο: ' else 'Από έγγραφο: ' end)||trim(item->>'text'))));
  end loop;
  if count_keys=0 then raise exception 'history_no_changes'; end if;
  select * into h from public.demo_history_save(p_tester,p_patient,patch,(p_review->>'expected_history_version')::integer);
  insert into private.demo_history_imports(scan_id,tester_id,patient_id,document_ids,additions,before_history,history_version,actor_id)
   values(s.id,p_tester,p_patient,s.document_ids,effective_additions,before_value,h.version,auth.uid());
  result_value:=jsonb_build_object('history',to_jsonb(h));
 else raise exception 'invalid_scan_review'; end if;
 update private.demo_document_scans set state='approved',review=p_review,result=result_value,approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=s.id;
 insert into private.demo_document_audit(document_id,tester_id,patient_id,action,actor_id)
  select id,p_tester,p_patient,'approved',auth.uid() from private.demo_patient_documents where id=any(s.document_ids);
 return result_value;
end $$;

revoke all on function public.demo_document_stage(uuid,uuid,uuid,jsonb),public.demo_document_complete(uuid,uuid,uuid),
 public.demo_document_list(uuid,uuid),public.demo_document_get(uuid,uuid,uuid,text),
 public.demo_document_scan_start(uuid,uuid,uuid,uuid[],uuid),public.demo_document_scan_finish(uuid,uuid,uuid,uuid,jsonb),
 public.demo_document_scan_get(uuid,uuid,uuid),public.demo_document_scan_commit(uuid,uuid,uuid,jsonb),public.demo_history_import_list(uuid,uuid)
 from public,anon;
grant execute on function public.demo_document_stage(uuid,uuid,uuid,jsonb),public.demo_document_complete(uuid,uuid,uuid),
 public.demo_document_list(uuid,uuid),public.demo_document_get(uuid,uuid,uuid,text),
 public.demo_document_scan_start(uuid,uuid,uuid,uuid[],uuid),public.demo_document_scan_finish(uuid,uuid,uuid,uuid,jsonb),
 public.demo_document_scan_get(uuid,uuid,uuid),public.demo_document_scan_commit(uuid,uuid,uuid,jsonb),public.demo_history_import_list(uuid,uuid)
 to authenticated;
notify pgrst,'reload schema';
