-- Preserve the provisional patient name when reviewing a scanned paper assignment without an existing folder or appointment.
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

  select coalesce(
    nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
    nullif(e.patient_name,''),
    nullif(trim(concat_ws(' ',a.identity->>'first_name',a.identity->>'last_name')),''),
    ''
  )
  into patient_name
  from (select 1) x
  left join public.demo_patients p on p.id=a.patient_id and p.tester_id=a.tester_id
  left join public.demo_calendar_events e on e.id=a.appointment_id and e.tester_id=a.tester_id;

  return jsonb_build_object(
    'id',a.id,'appointment_id',a.appointment_id,'patient_id',a.patient_id,
    'patient_name',coalesce(patient_name,''),'tools',a.tools,'channel',a.channel,
    'status',a.status,'expires_at',a.expires_at,'needs_identity',a.patient_id is null
  );
end
$scan_find$;
revoke all on function public.demo_intake_find_print(uuid,text) from public,anon;
grant execute on function public.demo_intake_find_print(uuid,text) to authenticated;

notify pgrst,'reload schema';
