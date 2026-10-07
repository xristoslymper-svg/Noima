-- Authenticated paper-scan bridge. The image itself is processed transiently by the app;
-- only reviewed structured responses are committed through the existing intake transaction.
create or replace function public.demo_intake_find_print(p_tester uuid,p_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $scan_find$
declare
  a private.demo_intakes;
  matches integer;
  patient_name text;
begin
  perform private.pilot_assert_owner(p_tester);
  if p_code is null or lower(p_code) !~ '^[0-9a-f]{8}$' then raise exception 'invalid_scan_code'; end if;

  select count(*) into matches
  from private.demo_intakes i
  where i.tester_id=p_tester
    and i.channel='print'
    and i.status in ('assigned','opened')
    and left(replace(i.id::text,'-',''),8)=lower(p_code);
  if matches<>1 then raise exception 'scan_assignment_not_found'; end if;

  select * into a
  from private.demo_intakes i
  where i.tester_id=p_tester
    and i.channel='print'
    and i.status in ('assigned','opened')
    and left(replace(i.id::text,'-',''),8)=lower(p_code)
  limit 1;

  select coalesce(trim(concat_ws(' ',p.first_name,p.last_name)),e.patient_name,'')
  into patient_name
  from (select 1) x
  left join public.demo_patients p on p.id=a.patient_id and p.tester_id=a.tester_id
  left join public.demo_calendar_events e on e.id=a.appointment_id and e.tester_id=a.tester_id;

  return jsonb_build_object(
    'id',a.id,'appointment_id',a.appointment_id,'patient_id',a.patient_id,
    'patient_name',coalesce(patient_name,''),'tools',a.tools,'channel',a.channel,
    'status',a.status,'expires_at',a.expires_at,'needs_identity',a.patient_id is null
  );
end $scan_find$;
revoke all on function public.demo_intake_find_print(uuid,text) from public,anon;
grant execute on function public.demo_intake_find_print(uuid,text) to authenticated;

create or replace function public.demo_intake_scan_commit(
  p_tester uuid,p_id uuid,p_identity jsonb,p_history jsonb,p_psych jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $scan_commit$
declare
  a private.demo_intakes;
  result jsonb;
  final_patient uuid;
begin
  perform private.pilot_assert_owner(p_tester);
  select * into a from private.demo_intakes
  where id=p_id and tester_id=p_tester and channel='print' and status in ('assigned','opened')
  for update;
  if not found then raise exception 'scan_assignment_not_found'; end if;

  update private.demo_intakes set channel='scanned_paper' where id=a.id;
  result:=private.intake_finalize(a.id,p_identity,p_history,p_psych);
  select patient_id into final_patient from private.demo_intakes where id=a.id;
  return result||jsonb_build_object('patient_id',final_patient,'intake_id',a.id);
end $scan_commit$;
revoke all on function public.demo_intake_scan_commit(uuid,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.demo_intake_scan_commit(uuid,uuid,jsonb,jsonb,jsonb) to authenticated;

notify pgrst,'reload schema';
