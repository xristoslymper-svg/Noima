-- Draft and confirmed memory share the encounter's existing ownership boundary.
alter table public.demo_sessions add column closure_draft jsonb;
alter table public.demo_sessions add column closure_version integer not null default 0;
alter table public.demo_sessions add column continuity jsonb;

create function public.demo_closure_save(p_tester uuid,p_session uuid,p_value jsonb,p_expected_version integer)
returns public.demo_sessions language plpgsql security definer set search_path='' as $$
declare s public.demo_sessions;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
 if not found or s.status<>'draft' or s.session_type<>'follow_up' then raise exception 'session_unavailable'; end if;
 if p_expected_version is distinct from s.closure_version then raise exception 'stale_closure'; end if;
 if jsonb_typeof(p_value) is distinct from 'object' or length(p_value::text)>100000
   or exists(select 1 from unnest(array['transcript','clinical_state_summary','treatment_decision','next_review_focus','pinned_context','adherence','source']) k where jsonb_typeof(p_value->k) is distinct from 'string')
   or p_value->>'source' not in ('manual','ai_assisted') then raise exception 'invalid_closure'; end if;
 update public.demo_sessions set closure_draft=p_value,closure_version=closure_version+1,version=version+1,updated_at=now() where id=s.id returning * into s;
 return s;
end $$;
revoke all on function public.demo_closure_save(uuid,uuid,jsonb,integer) from public,anon;
grant execute on function public.demo_closure_save(uuid,uuid,jsonb,integer) to authenticated;

-- Approval, canonical sections, finalization and task completion are atomic.
-- Risk and structured MSE remain the existing clinician-reviewed records.
create function public.demo_closure_finalize(p_tester uuid,p_session uuid,p_expected_version integer,p_confirmed boolean,p_expected_closure_version integer)
returns public.demo_sessions language plpgsql security definer set search_path='' as $$
declare s public.demo_sessions; v jsonb; k text; body text; sec public.demo_session_sections;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
 if not found then raise exception 'session_unavailable'; end if;
 if s.status='completed' and s.continuity is not null then return s; end if;
 if s.status<>'draft' or s.session_type<>'follow_up' then raise exception 'session_unavailable'; end if;
 if p_expected_version is distinct from s.version then raise exception 'stale_session'; end if;
 if p_expected_closure_version is distinct from s.closure_version then raise exception 'stale_closure'; end if;
 v:=s.closure_draft;
 if p_confirmed is distinct from true or v is null
  or length(trim(coalesce(v->>'clinical_state_summary','')))=0
  or length(trim(coalesce(v->>'treatment_decision','')))=0
  or length(trim(coalesce(v->>'next_review_focus','')))=0
  or length(trim(coalesce(v->>'adherence','')))=0 then raise exception 'closure_confirmation_required'; end if;
 if exists(
  select 1 from public.demo_sessions old_visit
  join public.demo_session_sections old_mse on old_mse.session_id=old_visit.id and old_mse.section_key='mse'
  cross join lateral jsonb_array_elements(old_mse.document->'fields') f
  where old_visit.patient_id=s.patient_id and old_visit.tester_id=p_tester and old_visit.status='completed' and old_visit.started_at<s.started_at
   and f->>'key'<>'legacy' and length(trim(f->>'text'))>0 and coalesce(f->>'review','')<>'not_assessed'
   and exists(select 1 from public.demo_session_sections current_mse where current_mse.session_id=s.id and current_mse.section_key='mse' and current_mse.document is not null)
   and not exists(select 1 from public.demo_session_sections current_mse cross join lateral jsonb_array_elements(current_mse.document->'fields') current_field
      where current_mse.session_id=s.id and current_mse.section_key='mse' and current_field->>'key'=f->>'key'
       and (current_field->>'review' in ('unchanged','changed','not_assessed') or length(trim(current_field->>'text'))>0))
 ) then raise exception 'mse_review_required'; end if;
 for k in select unnest(array['interview','assessment','plan','review','adherence']) loop
  body:=case k when 'interview' then v->>'clinical_state_summary' when 'assessment' then v->>'clinical_state_summary' when 'plan' then v->>'treatment_decision' when 'review' then v->>'next_review_focus' else v->>'adherence' end;
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
end $$;
revoke all on function public.demo_closure_finalize(uuid,uuid,integer,boolean,integer) from public,anon;
grant execute on function public.demo_closure_finalize(uuid,uuid,integer,boolean,integer) to authenticated;
