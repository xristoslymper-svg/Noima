-- Keep patient identity editing aligned with the create-folder fields.
create or replace function public.demo_patient_update_v2(
  p_tester uuid,
  p_patient uuid,
  p_first_name text,
  p_last_name text default '',
  p_age integer default null,
  p_phone text default '',
  p_landline text default '',
  p_contact_phone text default '',
  p_amka text default '',
  p_address text default '',
  p_email text default '',
  p_complaint text default '',
  p_expected_updated_at timestamptz default null
)
returns public.demo_patients
language plpgsql
security definer
set search_path=public
as $$
declare r public.demo_patients;
begin
  if length(trim(coalesce(p_first_name,'')))<1 then raise exception 'invalid_patient'; end if;
  if p_age is not null and (p_age<0 or p_age>120) then raise exception 'invalid_patient'; end if;
  if length(regexp_replace(coalesce(p_amka,''),'[^0-9]','','g')) not in (0,11) then raise exception 'invalid_patient'; end if;

  update public.demo_patients
  set first_name=trim(p_first_name),
      last_name=trim(coalesce(p_last_name,'')),
      reported_age=p_age,
      phone=trim(coalesce(p_phone,'')),
      landline=trim(coalesce(p_landline,'')),
      contact_phone=trim(coalesce(p_contact_phone,'')),
      amka=regexp_replace(coalesce(p_amka,''),'[^0-9]','','g'),
      address=trim(coalesce(p_address,'')),
      email=trim(coalesce(p_email,'')),
      chief_complaint=trim(coalesce(p_complaint,'')),
      updated_at=now()
  where id=p_patient and tester_id=p_tester
    and (p_expected_updated_at is null or updated_at=p_expected_updated_at)
  returning * into r;

  if r.id is null then
    if exists(select 1 from public.demo_patients where id=p_patient and tester_id=p_tester) then raise exception 'stale_patient'; end if;
    raise exception 'patient_not_found';
  end if;
  return r;
end $$;

revoke all on function public.demo_patient_update_v2(uuid,uuid,text,text,integer,text,text,text,text,text,text,text,timestamptz) from public;
grant execute on function public.demo_patient_update_v2(uuid,uuid,text,text,integer,text,text,text,text,text,text,text,timestamptz) to anon,authenticated;
