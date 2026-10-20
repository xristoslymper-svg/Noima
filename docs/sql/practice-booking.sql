-- Additive calendar-backed public booking. No existing tables/functions replaced.
create table private.practice_booking_settings(
 owner_id uuid primary key,workspace_id uuid not null,enabled boolean not null default false,
 days integer[] not null default array[1,2,3,4,5],start_time time not null default '11:00',
 end_time time not null default '19:00',duration integer not null default 50,buffer integer not null default 10,
 check(duration between 15 and 120),check(buffer between 0 and 60),
 check(start_time>='08:00' and end_time<='22:00' and end_time>start_time),
 check(cardinality(days) between 1 and 7 and days <@ array[1,2,3,4,5,6,7])
);
create table private.practice_booking_requests(
 id uuid primary key,owner_id uuid not null,workspace_id uuid not null,payload jsonb not null,
 start_at timestamptz not null,end_at timestamptz not null,fingerprint text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 event_id uuid,created_at timestamptz not null default now(),unique(owner_id,fingerprint),
 check(end_at>start_at),check(octet_length(payload::text)<3000)
);
create index practice_booking_owner_created on private.practice_booking_requests(owner_id,created_at desc);
alter table private.practice_booking_settings enable row level security;
alter table private.practice_booking_requests enable row level security;
revoke all on private.practice_booking_settings,private.practice_booking_requests from public,anon,authenticated;

create function private.practice_booking_slots(p_owner uuid,p_lead interval default interval '2 hours') returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('start',s.a,'end',s.b) order by s.a),'[]'::jsonb)
 from private.practice_booking_settings c
 cross join lateral generate_series((now() at time zone 'Europe/Athens')::date,
 (now() at time zone 'Europe/Athens')::date+13,interval '1 day') d
 cross join lateral generate_series(d::date+c.start_time,d::date+c.end_time-make_interval(mins=>c.duration),make_interval(mins=>c.duration+c.buffer)) t
 cross join lateral (select t at time zone 'Europe/Athens' a,(t+make_interval(mins=>c.duration)) at time zone 'Europe/Athens' b) s
 where c.owner_id=p_owner and c.enabled and extract(isodow from d)::integer=any(c.days)
 and s.a>=now()+p_lead
 and not exists(select 1 from public.demo_calendar_events e where e.tester_id=c.workspace_id and e.status<>'cancelled'
 and e.scheduled_start<s.b+make_interval(mins=>c.buffer) and e.scheduled_end>s.a-make_interval(mins=>c.buffer));
$$;
create function public.practice_booking_availability(p_owner uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',coalesce((select enabled from private.practice_booking_settings where owner_id=p_owner),false),'timezone','Europe/Athens','slots',private.practice_booking_slots(p_owner));
$$;

create function public.practice_booking_submit(p_owner uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.practice_booking_settings;r private.practice_booking_requests;rid uuid;st timestamptz;en timestamptz;fp text;
begin
 if jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>3000 or p_request->'consent' is distinct from 'true'::jsonb
 or coalesce(p_request->>'website','')<>'' or length(trim(coalesce(p_request->>'name',''))) not between 1 and 100
 or length(coalesce(p_request->>'email','')) not between 3 and 150 or p_request->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 or length(trim(coalesce(p_request->>'phone',''))) not between 1 and 40 or coalesce(p_request->>'kind','') not in ('Online','Δια ζώσης')
 then raise exception 'invalid_booking';end if;
 rid:=(p_request->>'id')::uuid;st:=(p_request->>'start')::timestamptz;en:=(p_request->>'end')::timestamptz;
 if rid is null or st is null or en is null then raise exception 'invalid_booking';end if;
 perform pg_advisory_xact_lock(9834710); -- bounded free public intake, including concurrent submissions
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,716));
 select * into c from private.practice_booking_settings where owner_id=p_owner;
 if not found or not c.enabled then raise exception 'booking_disabled';end if;
 perform pg_advisory_xact_lock(hashtextextended(c.workspace_id::text,721));
 fp:=md5(lower(trim(p_request->>'email'))||':'||extract(epoch from st)::text);
 select * into r from private.practice_booking_requests where id=rid;
 if found then
  if r.owner_id<>p_owner or r.start_at<>st or r.end_at<>en or r.payload->>'name' is distinct from trim(p_request->>'name')
  or r.payload->>'email' is distinct from lower(trim(p_request->>'email')) or r.payload->>'phone' is distinct from trim(p_request->>'phone')
  or r.payload->>'kind' is distinct from p_request->>'kind' then raise exception 'booking_id_conflict';end if;
  return jsonb_build_object('received',true);
 end if;
 select * into r from private.practice_booking_requests where owner_id=p_owner and fingerprint=fp;
 if found then
  if r.status='rejected' or (r.status='approved' and exists(select 1 from public.demo_calendar_events where id=r.event_id and tester_id=c.workspace_id and status='cancelled')) then
   update private.practice_booking_requests set fingerprint=fp||':'||r.id::text where id=r.id;
  else return jsonb_build_object('received',true);end if;
 end if;
 if not exists(select 1 from jsonb_array_elements(private.practice_booking_slots(p_owner)) s where (s->>'start')::timestamptz=st and (s->>'end')::timestamptz=en) then raise exception 'booking_slot_conflict';end if;
 if (select count(*) from private.practice_booking_requests where owner_id=p_owner and created_at>now()-interval '1 day')>=100
 or (select count(*) from private.practice_booking_requests)>=10000 then raise exception 'booking_limit';end if;
 insert into private.practice_booking_requests(id,owner_id,workspace_id,payload,start_at,end_at,fingerprint)
 values(rid,p_owner,c.workspace_id,jsonb_build_object('name',trim(p_request->>'name'),'email',lower(trim(p_request->>'email')),'phone',trim(p_request->>'phone'),'kind',p_request->>'kind'),st,en,fp);
 return jsonb_build_object('received',true);
end $$;

create function public.practice_booking_owner(p_action text,p_config jsonb default null,p_request uuid default null,p_patient uuid default null,p_new boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();wid uuid;c private.practice_booking_settings;r private.practice_booking_requests;ev jsonb;v_days integer[];n text;pid uuid;
begin
 if uid is null then raise exception 'booking_not_authorized' using errcode='42501';end if;
 wid:=(public.pilot_identity()->>'workspace_id')::uuid;
 if wid is null then raise exception 'booking_not_authorized' using errcode='42501';end if;
 perform private.pilot_assert_owner(wid);
 perform pg_advisory_xact_lock(hashtextextended(uid::text,716));
 perform pg_advisory_xact_lock(hashtextextended(wid::text,721)); -- same lock as every existing calendar writer
 if p_action='configure' then
  if jsonb_typeof(p_config)<>'object' or jsonb_typeof(p_config->'enabled')<>'boolean' or jsonb_typeof(p_config->'days')<>'array'
  or coalesce(p_config->>'start_time','') !~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p_config->>'end_time','') !~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_booking_settings';end if;
  select array_agg(value::integer order by value::integer) into v_days from jsonb_array_elements_text(p_config->'days');
  insert into private.practice_booking_settings(owner_id,workspace_id,enabled,days,start_time,end_time,duration,buffer)
  values(uid,wid,(p_config->>'enabled')::boolean,v_days,(p_config->>'start_time')::time,(p_config->>'end_time')::time,(p_config->>'duration')::integer,(p_config->>'buffer')::integer)
  on conflict(owner_id) do update set workspace_id=excluded.workspace_id,enabled=excluded.enabled,days=excluded.days,start_time=excluded.start_time,end_time=excluded.end_time,duration=excluded.duration,buffer=excluded.buffer;
 elsif p_action in ('approve','reject') then
  select * into r from private.practice_booking_requests where id=p_request and owner_id=uid and workspace_id=wid for update;
  if not found then raise exception 'booking_not_found';end if;
  if r.status='approved' then return jsonb_build_object('approved',true,'event_id',r.event_id);end if;
  if r.status<>'pending' then raise exception 'booking_resolved';end if;
  if p_action='reject' then update private.practice_booking_requests set status='rejected' where id=r.id;return jsonb_build_object('rejected',true);end if;
  if not exists(select 1 from jsonb_array_elements(private.practice_booking_slots(uid,interval '0 hours')) s where (s->>'start')::timestamptz=r.start_at and (s->>'end')::timestamptz=r.end_at) then raise exception 'booking_slot_conflict';end if;
  if p_patient is not null and not p_new then
   if not exists(select 1 from public.demo_patients where id=p_patient and tester_id=wid) then raise exception 'booking_patient_not_found';end if;
   ev:=public.demo_calendar_write_sms(wid,jsonb_build_object('action','create','patient_id',p_patient,'scheduled_start',r.start_at,'scheduled_end',r.end_at,'appointment_type','follow_up','detail','Δημόσιο αίτημα · '||(r.payload->>'kind')),false);
  elsif p_patient is null and p_new then
   n:=trim(r.payload->>'name');
   ev:=public.demo_calendar_create_patient_retry(wid,r.id,split_part(n,' ',1),trim(substr(n,length(split_part(n,' ',1))+1)),r.payload->>'phone',r.payload->>'email',r.start_at,r.end_at,'initial_assessment',false)->'event';
  else raise exception 'booking_patient_choice_required';end if;
  if ev->>'id' is null then raise exception 'booking_creation_failed';end if;
  update private.practice_booking_requests set status='approved',event_id=(ev->>'id')::uuid where id=r.id;
  return jsonb_build_object('approved',true,'event_id',ev->>'id');
 elsif p_action<>'read' then raise exception 'invalid_booking_action';end if;
 select * into c from private.practice_booking_settings where owner_id=uid and workspace_id=wid;
 return jsonb_build_object('settings',case when c.owner_id is null then null else to_jsonb(c)-'owner_id'-'workspace_id' end,
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'payload',q.payload,'start',q.start_at,'end',q.end_at,'status',q.status,'event_id',q.event_id,
 'event_status',e.status,'event_start',e.scheduled_start,'patient_id',e.patient_id,'created_at',q.created_at) order by q.created_at desc)
 from (select * from private.practice_booking_requests where owner_id=uid and workspace_id=wid order by created_at desc limit 200) q
 left join public.demo_calendar_events e on e.id=q.event_id and e.tester_id=wid),'[]'::jsonb));
end $$;
revoke all on function private.practice_booking_slots(uuid,interval) from public,anon,authenticated;
revoke all on function public.practice_booking_availability(uuid),public.practice_booking_submit(uuid,jsonb),public.practice_booking_owner(text,jsonb,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.practice_booking_availability(uuid),public.practice_booking_submit(uuid,jsonb) to anon,authenticated;
grant execute on function public.practice_booking_owner(text,jsonb,uuid,uuid,boolean) to authenticated;
