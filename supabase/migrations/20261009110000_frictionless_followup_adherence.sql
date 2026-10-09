-- Safe additive change to the follow-up confirmation RPC.
-- Leaves risk/MSE review, explicit clinician confirmation and visit immutability intact.
CREATE OR REPLACE FUNCTION public.demo_closure_finalize(p_tester uuid, p_session uuid, p_expected_version integer, p_confirmed boolean, p_expected_closure_version integer)
 RETURNS demo_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.demo_sessions; v jsonb; k text; body text; sec public.demo_session_sections; medication_review_required boolean;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
 if not found then raise exception 'session_unavailable'; end if;
 if s.status='completed' and s.continuity is not null then return s; end if;
 if s.status<>'draft' or s.session_type<>'follow_up' then raise exception 'session_unavailable'; end if;
 if p_expected_version is distinct from s.version then raise exception 'stale_session'; end if;
 if p_expected_closure_version is distinct from s.closure_version then raise exception 'stale_closure'; end if;
 v:=s.closure_draft;
 -- Do not demand an adherence statement when there is no active medication
 -- registered for the patient. Unknown is not assumed to be adherent.
 select exists(
  select 1 from public.demo_medications m
  where m.patient_id=s.patient_id and m.tester_id=p_tester and m.status='active'
 ) into medication_review_required;
 if p_confirmed is distinct from true or v is null
  or length(trim(coalesce(v->>'clinical_state_summary','')))=0
  or length(trim(coalesce(v->>'treatment_decision','')))=0
  or length(trim(coalesce(v->>'next_review_focus','')))=0
  or (medication_review_required and length(trim(coalesce(v->>'adherence','')))=0) then raise exception 'closure_confirmation_required'; end if;
 if exists(
  select 1 from public.demo_sessions old_visit
  join public.demo_session_sections old_mse on old_mse.session_id=old_visit.id and old_mse.section_key='mse'
  left join lateral (
   select correction.patch->'mse'->'after' document from public.demo_session_corrections correction
   where correction.session_id=old_visit.id and correction.patch->'mse' ? 'after'
   order by correction.created_at desc,correction.id desc limit 1
  ) corrected on true
  cross join lateral jsonb_array_elements((coalesce(corrected.document,old_mse.document))->'fields') f
  where old_visit.patient_id=s.patient_id and old_visit.tester_id=p_tester and old_visit.status='completed' and old_visit.started_at<s.started_at
   and f->>'key'<>'legacy' and length(trim(f->>'text'))>0 and coalesce(f->>'review','')<>'not_assessed'
   and exists(select 1 from public.demo_session_sections current_mse where current_mse.session_id=s.id and current_mse.section_key='mse' and current_mse.document is not null)
   and not exists(select 1 from public.demo_session_sections current_mse cross join lateral jsonb_array_elements(current_mse.document->'fields') current_field
      where current_mse.session_id=s.id and current_mse.section_key='mse' and current_field->>'key'=f->>'key'
       and (current_field->>'review' in ('unchanged','changed','not_assessed') or length(trim(current_field->>'text'))>0))
 ) then raise exception 'mse_review_required'; end if;
 for k in select unnest(array['interview','assessment','plan','review','adherence']) loop
  body:=case k when 'interview' then v->>'clinical_state_summary' when 'assessment' then v->>'clinical_state_summary' when 'plan' then v->>'treatment_decision' when 'review' then v->>'next_review_focus' else v->>'adherence' end;
  -- Do not create meaningless empty adherence documentation.
  if k='adherence' and length(trim(coalesce(body,'')))=0 then continue; end if;
  select * into sec from public.demo_session_sections where session_id=s.id and section_key=k;
  -- Detailed clinician records take precedence; continuity is a concise reference.
  if not found or length(trim(sec.content))=0 then
   perform public.demo_session_save_section(p_tester,s.id,k,body,'manual',sec.version);
  end if;
 end loop;
 -- The existing immutable-record trigger prohibits any write after finalization.
 -- A later failure rolls this confirmation back with the whole transaction.
 update public.demo_sessions set continuity=v||jsonb_build_object('session_id',s.id,'approved_at',now(),'approved_by',auth.uid()),closure_draft=null
 where id=s.id returning * into s;
 s:=public.demo_session_finalize(p_tester,p_session,s.version);
 return s;
end $function$;

revoke all on function public.demo_closure_finalize(uuid,uuid,integer,boolean,integer) from public,anon;
grant execute on function public.demo_closure_finalize(uuid,uuid,integer,boolean,integer) to authenticated;
