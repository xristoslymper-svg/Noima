-- Patient-folder isolation: return medication-event revisions only for the selected patient.
create or replace function private.pilot_impl_demo_medication_revisions_for_patient(p_tester uuid,p_patient uuid)
returns setof public.demo_medication_event_revisions
language sql stable security definer set search_path='public'
as $$
 select r.*
 from public.demo_medication_event_revisions r
 join public.demo_medication_events e on e.id=r.event_id
 where r.tester_id=p_tester and e.tester_id=p_tester and e.patient_id=p_patient
 order by r.created_at asc,r.id asc
$$;
revoke all on function private.pilot_impl_demo_medication_revisions_for_patient(uuid,uuid) from public,anon,authenticated;

create or replace function public.demo_medication_revisions_for_patient(p_tester uuid,p_patient uuid)
returns setof public.demo_medication_event_revisions
language plpgsql stable security definer set search_path=''
as $$
begin
 perform private.pilot_assert_owner(p_tester);
 return query select * from private.pilot_impl_demo_medication_revisions_for_patient(p_tester,p_patient);
end
$$;
revoke all on function public.demo_medication_revisions_for_patient(uuid,uuid) from public,anon;
grant execute on function public.demo_medication_revisions_for_patient(uuid,uuid) to authenticated;
