-- One round-trip projection for the dashboard.
create or replace function public.demo_overview_state(p_tester uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare payload jsonb;
begin
  perform private.pilot_assert_owner(p_tester);
  select jsonb_build_object(
    'events',coalesce((
      select jsonb_agg(to_jsonb(e)-'tester_id' order by e.scheduled_start)
      from public.demo_calendar_events e
      where e.tester_id=p_tester
    ),'[]'::jsonb),
    'tasks',coalesce((
      select jsonb_agg(to_jsonb(t) order by t.due_at nulls last,t.created_at desc)
      from public.demo_tasks t
      where t.tester_id=p_tester and t.status='open'
    ),'[]'::jsonb),
    'psychometrics',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,
        'patient_id',a.patient_id,
        'patient_name',trim(concat_ws(' ',p.first_name,p.last_name)),
        'instrument',a.instrument,
        'status',a.status,
        'score',a.score,
        'completed_at',a.completed_at,
        'created_at',a.created_at,
        'reviewed_at',a.reviewed_at,
        'item9_review',a.item9_review,
        'item9_reviewed_at',a.item9_reviewed_at
      ) order by coalesce(a.completed_at,a.created_at) desc)
      from private.demo_assessments a
      join public.demo_patients p on p.id=a.patient_id and p.tester_id=a.tester_id
      where a.tester_id=p_tester
        and a.status='completed'
        and (a.reviewed_at is null or (a.item9_review and a.item9_reviewed_at is null))
    ),'[]'::jsonb)
  ) into payload;
  return payload;
end $$;
revoke all on function public.demo_overview_state(uuid) from public,anon;
grant execute on function public.demo_overview_state(uuid) to authenticated;
