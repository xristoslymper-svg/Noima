-- Patient-completed history is readable immediately: track that the doctor opened it,
-- separately from clinical review/verification. No approval is inferred.
ALTER TABLE private.demo_intakes ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
UPDATE private.demo_intakes SET viewed_at=reviewed_at
 WHERE viewed_at IS NULL AND reviewed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.demo_intake_mark_viewed(p_tester uuid,p_patient uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE touched integer;
BEGIN
 PERFORM private.pilot_assert_owner(p_tester);
 IF NOT EXISTS(SELECT 1 FROM public.demo_patients WHERE id=p_patient AND tester_id=p_tester)
 THEN RAISE EXCEPTION 'patient_not_found'; END IF;
 UPDATE private.demo_intakes SET viewed_at=now()
 WHERE tester_id=p_tester AND patient_id=p_patient AND status='submitted'
   AND tools ? 'history' AND viewed_at IS NULL;
 GET DIAGNOSTICS touched = ROW_COUNT;
 RETURN touched;
END
$fn$;
REVOKE ALL ON FUNCTION public.demo_intake_mark_viewed(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.demo_intake_mark_viewed(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.demo_overview_state(p_tester uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb;
begin
 perform private.pilot_assert_owner(p_tester);
 select jsonb_build_object(
   'events',coalesce((select jsonb_agg(to_jsonb(e)-'tester_id' order by e.scheduled_start)
     from public.demo_calendar_events e where e.tester_id=p_tester),'[]'::jsonb),
   'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.due_at nulls last,t.created_at desc)
     from public.demo_tasks t where t.tester_id=p_tester and t.status='open'),'[]'::jsonb),
   'psychometrics',coalesce((select jsonb_agg(jsonb_build_object(
     'id',a.id,'patient_id',a.patient_id,'patient_name',trim(concat_ws(' ',p.first_name,p.last_name)),
     'instrument',a.instrument,'status',a.status,'score',a.score,'completed_at',a.completed_at,
     'created_at',a.created_at,'reviewed_at',a.reviewed_at,'item9_review',a.item9_review,'item9_reviewed_at',a.item9_reviewed_at,
     'intake_id',a.intake_id,'provenance',a.provenance
   ) order by coalesce(a.completed_at,a.created_at) desc)
     from private.demo_assessments a join public.demo_patients p on p.id=a.patient_id and p.tester_id=a.tester_id
     where a.tester_id=p_tester and a.status='completed'
       and (a.reviewed_at is null or (a.item9_review and a.item9_reviewed_at is null))),'[]'::jsonb),
   'intakes',coalesce((select jsonb_agg(jsonb_build_object(
     'id',i.id,'patient_id',i.patient_id,
     'patient_name',coalesce(
       nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
       nullif(e.patient_name,''),
       nullif(trim(concat_ws(' ',i.identity->>'first_name',i.identity->>'last_name')),''),
       ''
     ),
     'tools',i.tools,'channel',i.channel,'status',i.status,'submitted_at',i.submitted_at,'created_at',i.created_at
   ) order by coalesce(i.submitted_at,i.created_at) desc)
     from private.demo_intakes i
     left join public.demo_patients p on p.id=i.patient_id and p.tester_id=i.tester_id
     left join public.demo_calendar_events e on e.id=i.appointment_id and e.tester_id=i.tester_id
     where i.tester_id=p_tester and ((i.status='submitted' and i.tools ? 'history' and i.viewed_at is null) or i.status='conflict')
   ),'[]'::jsonb)
 ) into payload;
 return payload;
end
$function$

