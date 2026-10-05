-- One-off repair of the explicitly fictional Δόκιμος Α fixture.
-- The seed inserted a snapshot but omitted the events required by the timeline.
-- No function, permission, RLS policy or finalized visit is changed.
begin;
do $$
declare m public.demo_medications;
begin
 select * into m from public.demo_medications
 where id='76d1ca3e-e520-4043-82a8-3a85cdd356ca'
 and patient_id='5e944898-edd9-40da-b6b8-5967016173dd'
 and tester_id='0e11a456-79ac-4540-975e-59656ed6c588'
 and medication_name='Escitalopram' and status='active'
 and dose=10 and unit='mg' and started_at='2026-09-24' and effective_from='2026-10-01'
 for update;
 if m.id is null then raise exception 'fixture_contract_changed'; end if;
 if not exists(select 1 from public.demo_medication_events where medication_id=m.id) then
  -- The 24/9 agreed titration and 3/10 report of taking it as agreed support
  -- the 5 mg start; the stored effective_from dates the recorded 10 mg state.
  insert into public.demo_medication_events(tester_id,patient_id,medication_id,event_type,new_state,reason,effective_on)
  values(m.tester_id,m.patient_id,m.id,'started',jsonb_build_object('dose',5,'unit',m.unit,'frequency',m.frequency,'status','active'),
   'Επισκευή δοκιμαστικού seed: συμφωνημένη έναρξη 24/9 και επιβεβαίωση λήψης όπως συμφωνήθηκε 3/10.','2026-09-24');
  insert into public.demo_medication_events(tester_id,patient_id,medication_id,event_type,previous_state,new_state,reason,effective_on)
  values(m.tester_id,m.patient_id,m.id,'changed',jsonb_build_object('dose',5,'unit',m.unit,'frequency',m.frequency,'status','active'),
   jsonb_build_object('dose',10,'unit',m.unit,'frequency',m.frequency,'status','active'),
   'Επισκευή δοκιμαστικού seed: καταγεγραμμένη δόση 10 mg με effective_from 1/10, επιβεβαιωμένη στη συνεδρία 3/10.','2026-10-01');
  update public.demo_medications set plan_version=plan_version+1,updated_at=clock_timestamp() where id=m.id;
 end if;
end $$;
commit;
