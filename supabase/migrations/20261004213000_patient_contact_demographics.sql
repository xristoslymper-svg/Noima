-- Expand fictional patient demographics used by the create-folder flow.
alter table public.demo_patients
  add column if not exists amka text not null default '',
  add column if not exists address text not null default '',
  add column if not exists landline text not null default '',
  add column if not exists contact_phone text not null default '';

create or replace function public.demo_patient_create_v3(
  p_tester uuid,
  p_first_name text,
  p_last_name text default '',
  p_age integer default null,
  p_phone text default '',
  p_landline text default '',
  p_contact_phone text default '',
  p_amka text default '',
  p_address text default '',
  p_email text default '',
  p_complaint text default ''
)
returns public.demo_patients
language plpgsql
security definer
set search_path=public
as $$
declare r public.demo_patients;
begin
  if p_tester is null then raise exception 'tester_required'; end if;
  if length(trim(coalesce(p_first_name,'')))<1 then raise exception 'first_name_required'; end if;
  if p_age is not null and (p_age<0 or p_age>120) then raise exception 'invalid_patient'; end if;
  if length(regexp_replace(coalesce(p_amka,''),'[^0-9]','','g')) not in (0,11) then raise exception 'invalid_amka'; end if;

  insert into public.demo_patients(
    tester_id,first_name,last_name,reported_age,phone,landline,contact_phone,amka,address,email,chief_complaint
  ) values(
    p_tester,trim(p_first_name),trim(coalesce(p_last_name,'')),p_age,
    trim(coalesce(p_phone,'')),trim(coalesce(p_landline,'')),trim(coalesce(p_contact_phone,'')),
    regexp_replace(coalesce(p_amka,''),'[^0-9]','','g'),trim(coalesce(p_address,'')),
    trim(coalesce(p_email,'')),trim(coalesce(p_complaint,''))
  ) returning * into r;
  return r;
end $$;

revoke all on function public.demo_patient_create_v3(uuid,text,text,integer,text,text,text,text,text,text,text) from public;
grant execute on function public.demo_patient_create_v3(uuid,text,text,integer,text,text,text,text,text,text,text) to anon,authenticated;
