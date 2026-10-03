-- Protect patient history from silent cross-tab overwrites.
alter table public.demo_patient_history add column if not exists version integer not null default 1;

create or replace function public.demo_history_save(p_tester uuid,p_patient uuid,p_history jsonb,p_expected_version integer default null)
returns public.demo_patient_history language plpgsql security definer set search_path=public as $$
declare r public.demo_patient_history;
begin
 if not exists(select 1 from public.demo_patients where id=p_patient and tester_id=p_tester) then raise exception 'patient_not_found'; end if;
 select * into r from public.demo_patient_history where patient_id=p_patient for update;
 if r.patient_id is null then
  if coalesce(p_expected_version,0)<>0 then raise exception 'stale_history'; end if;
  insert into public.demo_patient_history(patient_id,tester_id,psychiatric_history,medical_history,previous_treatments,hospitalizations,family_history,substance_history,social_functioning,allergies,version)
  values(p_patient,p_tester,coalesce(p_history->>'psychiatric_history',''),coalesce(p_history->>'medical_history',''),coalesce(p_history->>'previous_treatments',''),coalesce(p_history->>'hospitalizations',''),coalesce(p_history->>'family_history',''),coalesce(p_history->>'substance_history',''),coalesce(p_history->>'social_functioning',''),coalesce(p_history->>'allergies',''),1) returning * into r;
 else
  if r.tester_id<>p_tester then raise exception 'patient_not_found'; end if;
  if p_expected_version is null or r.version<>p_expected_version then raise exception 'stale_history'; end if;
  update public.demo_patient_history set psychiatric_history=coalesce(p_history->>'psychiatric_history',''),medical_history=coalesce(p_history->>'medical_history',''),previous_treatments=coalesce(p_history->>'previous_treatments',''),hospitalizations=coalesce(p_history->>'hospitalizations',''),family_history=coalesce(p_history->>'family_history',''),substance_history=coalesce(p_history->>'substance_history',''),social_functioning=coalesce(p_history->>'social_functioning',''),allergies=coalesce(p_history->>'allergies',''),version=version+1,updated_at=now() where patient_id=p_patient returning * into r;
 end if;
 return r;
end $$;
revoke all on function public.demo_history_save(uuid,uuid,jsonb,integer) from public;
grant execute on function public.demo_history_save(uuid,uuid,jsonb,integer) to anon,authenticated;
