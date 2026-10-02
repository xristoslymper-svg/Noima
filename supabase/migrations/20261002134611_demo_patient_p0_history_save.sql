create or replace function public.demo_history_save(p_tester uuid,p_patient uuid,p_history jsonb) returns public.demo_patient_history language plpgsql security definer set search_path=public as $$
declare r public.demo_patient_history; begin
 if not exists(select 1 from public.demo_patients where id=p_patient and tester_id=p_tester) then raise exception 'patient_not_found'; end if;
 insert into public.demo_patient_history(patient_id,tester_id,psychiatric_history,medical_history,previous_treatments,hospitalizations,family_history,substance_history,social_functioning,allergies)
 values(p_patient,p_tester,coalesce(p_history->>'psychiatric_history',''),coalesce(p_history->>'medical_history',''),coalesce(p_history->>'previous_treatments',''),coalesce(p_history->>'hospitalizations',''),coalesce(p_history->>'family_history',''),coalesce(p_history->>'substance_history',''),coalesce(p_history->>'social_functioning',''),coalesce(p_history->>'allergies',''))
 on conflict(patient_id) do update set psychiatric_history=excluded.psychiatric_history,medical_history=excluded.medical_history,previous_treatments=excluded.previous_treatments,hospitalizations=excluded.hospitalizations,family_history=excluded.family_history,substance_history=excluded.substance_history,social_functioning=excluded.social_functioning,allergies=excluded.allergies,updated_at=now() returning * into r; return r;
end $$;
grant execute on function public.demo_history_save(uuid,uuid,jsonb) to anon,authenticated;
