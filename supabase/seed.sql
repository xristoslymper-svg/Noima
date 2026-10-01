-- FICTIONAL DEVELOPMENT DATA ONLY. Disabled in config.toml; never part of db push.
-- Provision a LOCAL Auth user first, then set noima.allow_demo='yes' and
-- noima.demo_user_id to that user's UUID within the transaction that runs this file.
-- No passwords, emails, identities, or patients are created in production by migrations.
do $$
declare
  practitioner uuid := nullif(current_setting('noima.demo_user_id',true),'')::uuid;
  practice uuid; maria uuid; kostas uuid; giannis uuid; eleni uuid;
  med uuid; trazodone uuid; visit uuid; section_id uuid; instrument uuid; assessment uuid;
  r record; n integer := 0;
begin
  if current_setting('noima.allow_demo',true) is distinct from 'yes' or practitioner is null then
    raise exception 'Demo seed requires explicit opt-in and a local Auth user';
  end if;
  if not exists(select 1 from auth.users where id=practitioner) then raise exception 'Provision the local Auth user first'; end if;
  if exists(select 1 from public.practice_members where user_id=practitioner) then
    raise exception 'Use an isolated demo account without existing practice membership';
  end if;
  perform set_config('request.jwt.claim.sub',practitioner::text,true);
  insert into public.profiles(id,full_name,professional_title)
    values(practitioner,'Δρ. Κατερίνα Παπαδάκη','Ψυχίατρος')
    on conflict(id) do update set full_name=excluded.full_name,professional_title=excluded.professional_title;
  insert into public.practices(name,is_demo) values('Νόημα · ΥΠΟΘΕΤΙΚΑ ΔΕΔΟΜΕΝΑ DEMO',true) returning id into practice;
  insert into public.practice_members(practice_id,user_id,role) values(practice,practitioner,'owner');
  insert into public.patients(practice_id,first_name,reported_age,age_reported_at)
    values(practice,'Μαρία',32,'2026-10-01') returning id into maria;
  insert into public.patients(practice_id,first_name,last_name,reported_age,age_reported_at)
    values(practice,'Κώστας','Σ.',37,'2026-10-01') returning id into kostas;
  insert into public.patients(practice_id,first_name,last_name,reported_age,age_reported_at)
    values(practice,'Γιάννης','Π.',41,'2026-10-01') returning id into giannis;
  insert into public.patients(practice_id,first_name,last_name,reported_age,age_reported_at)
    values(practice,'Ελένη','Δ.',28,'2026-10-01') returning id into eleni;
  insert into public.patient_history(patient_id,practice_id,chief_complaint,psychiatric_history,substance_history,family_history,social_functioning,protective_factors)
  values(maria,practice,
    'Πρώτη προσέλευση 06/06 με 3μηνη περίοδο καταθλιπτικής διάθεσης, ανηδονίας, πρωινής κόπωσης, δυσκολίας συγκέντρωσης και αυξανόμενων κρίσεων πανικού. Επιβάρυνση μετά από αλλαγή ρόλου στην εργασία.',
    'Χωρίς προηγούμενη νοσηλεία ή απόπειρα αυτοκτονίας. Σύντομη ψυχοθεραπεία στα 26 για άγχος εξετάσεων. Δεν αναφέρεται προηγούμενο μανιακό ή ψυχωτικό επεισόδιο.',
    'Αλκοόλ 1–2 ποτά/εβδομάδα. Δεν αναφέρει χρήση άλλων ουσιών. Καφές 2/ημέρα, αποφεύγει καφεΐνη μετά τις 15:00.',
    'Μητέρα με ιστορικό καταθλιπτικού επεισοδίου. Δεν αναφέρεται γνωστό οικογενειακό ιστορικό διπολικής διαταραχής ή αυτοκτονίας.',
    'Τον Ιούνιο είχε μειώσει προσωρινά το ωράριο. Από 15/09 εργάζεται ξανά πλήρες ωράριο. Παραμένει anticipatory anxiety πριν από παρουσιάσεις.',
    'Σταθερή σχέση, καλή επαφή με αδελφή, εργασία που επιθυμεί να διατηρήσει, θεραπευτική συνεργασία και καλή προσήλωση.');
  insert into public.patient_history(patient_id,practice_id,chief_complaint)
    values(kostas,practice,'Επίμονο άγχος και δυσκολία ύπνου περίπου 4 μήνες.');
  insert into public.patient_diagnoses(patient_id,practice_id,diagnosis_text,diagnosed_at) values
    (maria,practice,'Μείζον καταθλιπτικό επεισόδιο','2026-06-06T08:00:00+03'),
    (maria,practice,'Διαταραχή πανικού','2026-06-06T08:00:00+03'),
    (giannis,practice,'Αγχώδης διαταραχή','2026-09-10T12:30:00+03');
  insert into public.patient_medications(patient_id,practice_id,medication_name,dose,unit,frequency,started_at,effective_from)
    values(maria,practice,'Sertraline',25,'mg','πρωί','2026-06-06','2026-06-06') returning id into med;
  update public.patient_medications set dose=50,effective_from='2026-06-13' where id=med;
  update public.patient_medications set dose=100,effective_from='2026-09-03' where id=med;
  insert into public.patient_medications(patient_id,practice_id,medication_name,dose,unit,frequency,started_at,effective_from,notes)
    values(maria,practice,'Trazodone',50,'mg','βράδυ','2026-06-20','2026-06-20','Ύπνος από 4–5 ώρες σε 6–7 ώρες. Λιγότερες νυχτερινές αφυπνίσεις.') returning id into trazodone;
  insert into public.medication_side_effects(patient_id,practice_id,medication_id,description,severity,impact,reported_at) values
    (maria,practice,med,'Μειωμένη libido μετά την αύξηση δόσης Sertraline.','μέτρια','μέτρια ενόχληση','2026-09-10T11:00:00+03'),
    (maria,practice,trazodone,'Ήπια πρωινή υπνηλία τις πρώτες ημέρες, πλέον όχι.','ήπια',null,'2026-06-27T11:00:00+03');

  -- Historical visits contain only the documentation actually present in the UI.
  -- Do not invent six complete section records for abbreviated legacy visit notes.
  for r in select * from (values
    ('2026-06-06T11:00:00+03'::timestamptz,'initial_assessment'::public.session_type,'Καταθλιπτική διάθεση, ανηδονία, κόπωση, δυσκολία συγκέντρωσης και 2–3 κρίσεις πανικού/εβδομάδα. Χωρίς ιστορικό μανίας/ψύχωσης.'),
    ('2026-09-03T11:00:00+03'::timestamptz,'follow_up'::public.session_type,'Μερική ανταπόκριση στα 50 mg, αλλά παραμένει anticipatory anxiety. Συμφωνήθηκε αύξηση sertraline σε 100 mg.'),
    ('2026-09-17T11:00:00+03'::timestamptz,'follow_up'::public.session_type,'Χωρίς κρίση πανικού από 31/08. Διάθεση σαφώς καλύτερη. Μειωμένη libido μετά την αύξηση sertraline. Αρνείται SI/plan/intent.')
  ) v(at_time,kind,note) loop
    insert into public.clinical_sessions(patient_id,practice_id,session_type,scheduled_at,started_at)
      values(maria,practice,r.kind,r.at_time,r.at_time) returning id into visit;
    insert into public.session_sections(session_id,patient_id,practice_id,section_type,content)
      values(visit,maria,practice,'clinical_assessment',r.note) returning id into section_id;
    update public.session_sections set status='approved',approved_by=practitioner,approved_at=r.at_time where id=section_id;
    if r.at_time::date='2026-09-17' then
      insert into public.risk_assessments(patient_id,practice_id,session_id,suicidal_ideation,intent,plan,attempt_history,assessed_at)
        values(maria,practice,visit,false,false,false,false,r.at_time);
    end if;
    -- Administrative legacy import only, not a clinician API completion path.
    update public.clinical_sessions set status='completed',completed_at=r.at_time+interval '50 minutes' where id=visit;
  end loop;
  for r in select * from (values('PHQ-9','Κατάθλιψη'),('GAD-7','Άγχος'),('ASRS','ΔΕΠΥ ενηλίκων'),('AUDIT-C','Χρήση αλκοόλ')) v(code,name) loop
    insert into public.psychometric_instruments(code,name,version,description,active)
      values(r.code,r.name,'demo-historical','Demo registry only; instrument content must be reviewed before activation.',false)
      on conflict(code,version) do nothing;
  end loop;
  for r in select * from (values
    ('2026-06-06'::date,17,14),('2026-07-04'::date,14,11),('2026-08-08'::date,11,8),('2026-09-17'::date,7,5)
  ) v(day,phq,gad) loop
    for n in 1..2 loop
      select id into instrument from public.psychometric_instruments where code=case n when 1 then 'PHQ-9' else 'GAD-7' end and version='demo-historical';
      insert into public.psychometric_assessments(patient_id,practice_id,instrument_id,delivery_method,result_source)
        values(maria,practice,instrument,'clinician','historical_total') returning id into assessment;
      update public.psychometric_assessments set status='completed',completed_at=r.day::timestamptz,total_score=case n when 1 then r.phq else r.gad end where id=assessment;
    end loop;
  end loop;
  insert into public.appointments(practice_id,patient_id,clinician_id,scheduled_start,scheduled_end,appointment_type) values
    (practice,maria,practitioner,'2026-10-01T11:00:00+03','2026-10-01T11:50:00+03','follow_up'),
    (practice,giannis,practitioner,'2026-10-01T12:30:00+03','2026-10-01T13:20:00+03','follow_up'),
    (practice,eleni,practitioner,'2026-10-01T14:00:00+03','2026-10-01T14:50:00+03','follow_up'),
    (practice,kostas,practitioner,'2026-10-01T16:00:00+03','2026-10-01T16:50:00+03','initial_assessment');
  -- Kostas intentionally has no completed session or risk result. His UI's proposed
  -- assessment must not become clinical truth merely by seeding the pre-visit patient.
end $$;
