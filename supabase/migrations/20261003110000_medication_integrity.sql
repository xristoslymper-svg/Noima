-- Medication integrity: validate session ownership for side effects and make resolution explicit.
create or replace function public.demo_medication_side_effect_add(p_tester uuid,p_medication uuid,p_session uuid,p_effect text,p_severity text,p_impact text,p_noted_on date,p_note text default '')
returns public.demo_medication_side_effects language plpgsql security definer set search_path=public as $$
declare m public.demo_medications; r public.demo_medication_side_effects;
begin
 select * into m from public.demo_medications where id=p_medication and tester_id=p_tester;
 if m.id is null then raise exception 'medication_not_found'; end if;
 if p_session is not null and not exists(select 1 from public.demo_sessions where id=p_session and tester_id=p_tester and patient_id=m.patient_id and status='draft') then raise exception 'session_unavailable'; end if;
 if length(trim(coalesce(p_effect,'')))<2 or p_severity not in ('mild','moderate','severe') or p_noted_on is null then raise exception 'invalid_side_effect'; end if;
 insert into public.demo_medication_side_effects(tester_id,patient_id,medication_id,session_id,effect_text,severity,impact,noted_on,note)
 values(p_tester,m.patient_id,m.id,p_session,trim(p_effect),p_severity,trim(coalesce(p_impact,'')),p_noted_on,trim(coalesce(p_note,''))) returning * into r;
 return r;
end $$;

create or replace function public.demo_medication_side_effect_resolve(p_tester uuid,p_id uuid,p_resolved_on date)
returns public.demo_medication_side_effects language plpgsql security definer set search_path=public as $$
declare r public.demo_medication_side_effects;
begin
 select * into r from public.demo_medication_side_effects where id=p_id and tester_id=p_tester for update;
 if r.id is null then raise exception 'side_effect_not_found'; end if;
 if r.resolved_on is not null then return r; end if;
 if p_resolved_on is null or p_resolved_on<r.noted_on then raise exception 'invalid_resolution_date'; end if;
 update public.demo_medication_side_effects set resolved_on=p_resolved_on,updated_at=now() where id=p_id returning * into r;
 return r;
end $$;
revoke all on function public.demo_medication_side_effect_resolve(uuid,uuid,date) from public;
grant execute on function public.demo_medication_side_effect_resolve(uuid,uuid,date) to anon,authenticated;
