create or replace function public.demo_seed_maria_record(p_tester uuid) returns void
language plpgsql security definer set search_path=public as $$
declare maria uuid:=md5(p_tester::text||':maria')::uuid; sid uuid:=md5(p_tester::text||':maria:baseline:2026-09-17')::uuid; med uuid;
begin
 if p_tester is null then raise exception 'tester_required'; end if;
 if not exists(select 1 from public.demo_patients where id=maria and tester_id=p_tester) then return; end if;
 if not exists(select 1 from public.demo_sessions where patient_id=maria and tester_id=p_tester and status='completed') then
  insert into public.demo_sessions(id,tester_id,patient_id,session_type,status,version,started_at,completed_at,created_at,updated_at) values(sid,p_tester,maria,'follow_up','completed',9,'2026-09-17 11:00+03','2026-09-17 11:50+03','2026-09-17 11:00+03','2026-09-17 11:50+03') on conflict(id) do nothing;
  insert into public.demo_session_sections(tester_id,patient_id,session_id,section_key,content,source,version,updated_at) values
  (p_tester,maria,sid,'interview','Σημαντική βελτίωση διάθεσης και άγχους. Δεν αναφέρει κρίσεις πανικού τις τελευταίες δύο εβδομάδες. Ύπνος 6–7 ώρες με μία αφύπνιση. Επέστρεψε σε πλήρες ωράριο εργασίας.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'functioning','Πλήρης επιστροφή στην εργασία από 15/09. Παραμένει άγχος πριν από σημαντικές παρουσιάσεις.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'effects','Μειωμένη libido, μέτρια ενόχληση, υπό παρακολούθηση.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'adherence','Καλή συμμόρφωση. Αναφέρει περίπου μία παράλειψη δόσης τον μήνα.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'mse','Σε εγρήγορση και πλήρως προσανατολισμένη. Συνεργάσιμη. Λόγος φυσιολογικού ρυθμού και έντασης. Διάθεση βελτιωμένη, συναίσθημα ανάλογο. Σκέψη οργανωμένη, χωρίς ψυχωτικά στοιχεία.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'assessment','Μείζον καταθλιπτικό επεισόδιο και διαταραχή πανικού με σαφή κλινική βελτίωση υπό την τρέχουσα αγωγή. Παραμένει σεξουαλική δυσλειτουργία πιθανώς σχετιζόμενη με SSRI.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'plan','Συνέχιση Sertraline 100 mg το πρωί και Trazodone 50 mg το βράδυ. Παρακολούθηση σεξουαλικής δυσλειτουργίας, άγχους σε παρουσιάσεις και συμμόρφωσης.','manual',1,'2026-09-17 11:45+03'),
  (p_tester,maria,sid,'review','Επανεκτίμηση σε περίπου δύο εβδομάδες. Επανέλεγχος αυτοκτονικού ιδεασμού και ανοχής αγωγής.','manual',1,'2026-09-17 11:45+03') on conflict(session_id,section_key) do nothing;
  insert into public.demo_risk_assessments(session_id,tester_id,patient_id,suicidal_ideation,intent,plan,self_harm,attempt_history,protective_factors,clinical_note,version,updated_at)
  values(sid,p_tester,maria,'negative','negative','negative','negative','negative','Σχέση, αδελφή, εργασία, θεραπευτική συμμαχία και καλή συμμόρφωση.','Αρνείται αυτοκτονικό ιδεασμό, πρόθεση ή σχέδιο. Δεν αναφέρεται ιστορικό απόπειρας.',1,'2026-09-17 11:45+03') on conflict(session_id) do nothing;
 end if;
 if not exists(select 1 from public.demo_medications where patient_id=maria and medication_name='Trazodone' and status='active') then
  insert into public.demo_medications(tester_id,patient_id,medication_name,dose,unit,frequency,effective_from,started_at,notes) values(p_tester,maria,'Trazodone',50,'mg','1× βράδυ','2026-06-20','2026-06-20','Όφελος στον ύπνο. Παροδική πρωινή υπνηλία.') returning id into med;
  insert into public.demo_medication_events(tester_id,patient_id,medication_id,session_id,event_type,new_state,reason,effective_on) values(p_tester,maria,med,sid,'started',jsonb_build_object('dose',50,'unit','mg','frequency','1× βράδυ','status','active'),'Ύπνος','2026-06-20');
 end if;
end $$;
grant execute on function public.demo_seed_maria_record(uuid) to anon,authenticated;
do $$ declare t uuid; begin for t in select distinct tester_id from public.demo_patients where tester_id is not null loop perform public.demo_seed_maria_record(t); end loop; end $$;
