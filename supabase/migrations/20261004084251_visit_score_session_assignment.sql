-- Explicit visit attribution; never infer a visit from a measurement date.
create or replace function public.demo_assessment_assign_to_session(p_tester uuid,p_patient uuid,p_session uuid,p_id uuid,p_instrument text,p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.demo_assessments;
begin
 if p_session is null then raise exception 'session_unavailable'; end if;
 perform 1 from public.demo_sessions where id=p_session and tester_id=p_tester and patient_id=p_patient and status='draft' for update;
 if not found then raise exception 'session_unavailable'; end if;
 perform public.demo_assessment_assign(p_tester,p_patient,null,p_id,p_instrument,p_token);
 select * into r from private.demo_assessments where id=p_id for update;
 if r.session_id is not null and r.session_id<>p_session then raise exception 'request_conflict'; end if;
 update private.demo_assessments set session_id=p_session where id=p_id returning * into r;
 return to_jsonb(r)-'token_hash';
end $$;
revoke all on function public.demo_assessment_assign_to_session(uuid,uuid,uuid,uuid,text,text) from public;
grant execute on function public.demo_assessment_assign_to_session(uuid,uuid,uuid,uuid,text,text) to anon,authenticated;
