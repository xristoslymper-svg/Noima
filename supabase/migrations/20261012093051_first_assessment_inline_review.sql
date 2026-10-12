-- First Assessment uses one plan section. Existing review content is untouched.
-- Preserve the public owner/task wrapper and all existing risk/version guards.
create or replace function private.pilot_impl_demo_session_finalize(
  p_tester uuid,
  p_session uuid,
  p_expected_version integer
)
returns public.demo_sessions
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.demo_sessions;
  missing text;
  risk public.demo_risk_assessments;
begin
  select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
  if s.id is null then raise exception 'session_unavailable'; end if;
  if s.status='completed' then return s; end if;
  if p_expected_version is null or s.version<>p_expected_version then raise exception 'stale_session'; end if;

  select string_agg(u.section,', ') into missing
  from unnest(array['interview','mse','assessment','plan','review']) as u(section)
  where (s.session_type<>'initial_assessment' or u.section<>'review') and not exists(
    select 1 from public.demo_session_sections
    where session_id=p_session and section_key=u.section and length(trim(content))>0
  );
  if missing is not null then raise exception 'missing_sections:%',missing; end if;

  select * into risk from public.demo_risk_assessments where session_id=p_session;
  if risk.session_id is null or risk.suicidal_ideation='not_assessed' then raise exception 'risk_required'; end if;
  if risk.suicidal_ideation='positive'
     and (
       risk.intent='not_assessed'
       or risk.plan='not_assessed'
       or risk.self_harm='not_assessed'
       or risk.attempt_history='not_assessed'
     )
  then
    raise exception 'risk_followup_required';
  end if;

  update public.demo_sessions
  set status='completed',completed_at=now(),version=version+1,updated_at=now()
  where id=p_session
  returning * into s;

  update public.demo_calendar_events
  set status='completed',updated_at=now()
  where tester_id=p_tester and session_id=p_session and status='scheduled';

  return s;
end $$;
revoke all on function private.pilot_impl_demo_session_finalize(uuid,uuid,integer) from public,anon,authenticated;

-- Inline corrections are limited to effects entered in this initial draft.
-- Keep previous text in the existing note; never rewrite another visit's history.
create or replace function public.demo_initial_side_effect_edit(p_tester uuid,p_session uuid,p_id uuid,p_effect text,p_expected_updated_at timestamptz)
returns public.demo_medication_side_effects language plpgsql security definer set search_path='' as $$
declare s public.demo_sessions; r public.demo_medication_side_effects;
begin
 perform private.pilot_assert_owner(p_tester);
 select * into s from public.demo_sessions where id=p_session and tester_id=p_tester for update;
 if s.id is null or s.status<>'draft' or s.session_type<>'initial_assessment' then raise exception 'session_unavailable'; end if;
 select * into r from public.demo_medication_side_effects where id=p_id and tester_id=p_tester and patient_id=s.patient_id and session_id=s.id for update;
 if r.id is null then raise exception 'side_effect_unavailable'; end if;
 if p_expected_updated_at is null or r.updated_at<>p_expected_updated_at then raise exception 'stale_side_effect'; end if;
 if length(trim(coalesce(p_effect,'')))<2 or length(p_effect)>20000 then raise exception 'invalid_side_effect'; end if;
 if r.effect_text=trim(p_effect) then return r; end if;
 update public.demo_medication_side_effects set effect_text=trim(p_effect),
 note=concat_ws(E'\n',nullif(note,''),'Προηγούμενη καταγραφή ('||r.updated_at::text||'): '||r.effect_text),updated_at=clock_timestamp()
 where id=r.id returning * into r;
 return r;
end $$;
revoke all on function public.demo_initial_side_effect_edit(uuid,uuid,uuid,text,timestamptz) from public,anon;
grant execute on function public.demo_initial_side_effect_edit(uuid,uuid,uuid,text,timestamptz) to authenticated;
