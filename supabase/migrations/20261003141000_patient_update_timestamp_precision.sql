-- Ensure patient optimistic concurrency token changes even across multiple writes in one transaction.
create or replace function public.demo_patient_update(
  p_tester uuid,
  p_patient uuid,
  p_first_name text,
  p_last_name text,
  p_age integer,
  p_phone text,
  p_email text,
  p_complaint text,
  p_expected_updated_at timestamptz default null
)
returns public.demo_patients
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.demo_patients;
begin
  select * into p
  from public.demo_patients
  where id=p_patient and tester_id=p_tester
  for update;

  if p.id is null then raise exception 'patient_not_found'; end if;
  if p_expected_updated_at is null or p.updated_at is distinct from p_expected_updated_at then raise exception 'stale_patient'; end if;
  if length(trim(coalesce(p_first_name,'')))<1 then raise exception 'invalid_patient'; end if;
  if p_age is not null and (p_age<0 or p_age>120) then raise exception 'invalid_patient'; end if;

  update public.demo_patients
  set first_name=trim(p_first_name),
      last_name=trim(coalesce(p_last_name,'')),
      reported_age=p_age,
      phone=trim(coalesce(p_phone,'')),
      email=trim(coalesce(p_email,'')),
      chief_complaint=trim(coalesce(p_complaint,'')),
      updated_at=clock_timestamp()
  where id=p_patient and tester_id=p_tester
  returning * into p;

  update public.demo_calendar_events
  set patient_name=trim(p.first_name||' '||p.last_name),updated_at=clock_timestamp()
  where tester_id=p_tester and patient_id=p_patient;

  return p;
end $$;
