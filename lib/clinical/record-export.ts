import type {PatientBundle} from '../patients/demo-runtime';
// Plain text, not executable HTML/Markdown. No AI-derived conclusions or invitation tokens.
export function patientRecordText(b:PatientBundle,exportedAt=new Date().toISOString()){
 const lines=[`Ψ / Noima — Κλινικός φάκελος`,`Μόνο φανταστικά δεδομένα · Εξαγωγή ${exportedAt}`,`${b.patient.first_name} ${b.patient.last_name}`,`ID: ${b.patient.id}`,`Ηλικία: ${b.patient.reported_age??'Δεν καταγράφηκε'}`,`Λόγος προσέλευσης: ${b.patient.chief_complaint||'Δεν καταγράφηκε'}`,`Τηλέφωνο: ${b.patient.phone||'Δεν καταγράφηκε'} · Email: ${b.patient.email||'Δεν καταγράφηκε'}`,'','ΙΣΤΟΡΙΚΟ',JSON.stringify(b.history,null,2)||'Δεν καταγράφηκε'];
 const clinicalTime=(session:PatientBundle['sessions'][number])=>b.appointments.find(a=>a.session_id===session.id)?.scheduled_start||session.started_at;
 for(const s of [...b.sessions].sort((a,c)=>Date.parse(clinicalTime(a))-Date.parse(clinicalTime(c)))){
  lines.push('',`ΚΑΤΑΓΡΑΦΗ ${clinicalTime(s)} · ${s.status==='completed'?'Οριστικοποιημένη':'Πρόχειρη'} · ${s.id}`,`Ολοκλήρωση τεκμηρίωσης: ${s.completed_at||'—'} · Έκδοση ${s.version}`);
  for(const section of b.sections.filter(x=>x.session_id===s.id))lines.push('',section.section_key,section.content,`Πηγή ${section.source} · έκδοση ${section.version}`);
  lines.push('','ΔΟΜΗΜΕΝΟΣ ΚΙΝΔΥΝΟΣ',JSON.stringify(b.risks.find(r=>r.session_id===s.id)||null,null,2));
  for(const a of b.addenda.filter(a=>a.session_id===s.id))lines.push('',`${a.kind} ${a.created_at} · ${a.id}`,`Λόγος: ${a.reason}`,a.content);
  for(const c of (b.corrections||[]).filter(c=>c.session_id===s.id).sort((a,z)=>Date.parse(a.created_at)-Date.parse(z.created_at)||a.id.localeCompare(z.id)))lines.push('','ΔΟΜΗΜΕΝΗ ΔΙΟΡΘΩΣΗ '+c.created_at+' · '+c.id,'Λόγος: '+c.reason,JSON.stringify(c.patch,null,2));
 }
 lines.push('','ΑΓΩΓΗ ΣΤΟ ΣΗΜΕΙΟ ΕΞΑΓΩΓΗΣ',JSON.stringify(b.medications,null,2),'','ΧΡΟΝΟΛΟΓΙΟ ΑΓΩΓΗΣ / ΔΙΟΡΘΩΣΕΙΣ',JSON.stringify([...b.medicationEvents].sort((a,c)=>a.effective_on.localeCompare(c.effective_on)),null,2),JSON.stringify(b.medicationRevisions,null,2),'','ΠΑΡΕΝΕΡΓΕΙΕΣ — ΕΠΙΛΥΜΕΝΕΣ ΚΑΙ ΑΝΕΠΙΛΥΤΕΣ',JSON.stringify(b.medicationSideEffects,null,2),'','ΨΥΧΟΜΕΤΡΙΚΑ — ΑΠΑΝΤΗΣΕΙΣ / ΒΑΘΜΟΙ / ΕΛΕΓΧΟΣ / ΣΥΝΔΕΣΗ',JSON.stringify(b.assessments,null,2),'','ΡΑΝΤΕΒΟΥ / ΣΥΝΔΕΣΗ ΣΥΝΕΔΡΙΑΣ',JSON.stringify(b.appointments,null,2),'','ΠΡΟΕΛΕΥΣΗ ΥΠΑΓΟΡΕΥΣΕΩΝ — Η ΜΗ ΕΓΚΕΚΡΙΜΕΝΗ ΠΡΟΤΑΣΗ ΔΕΝ ΕΙΝΑΙ ΚΛΙΝΙΚΟ ΣΥΜΠΕΡΑΣΜΑ',JSON.stringify(b.proposals,null,2),'','ΚΑΝΟΝΙΚΑ ΔΕΔΟΜΕΝΑ — ΠΛΗΡΕΣ ΑΝΑΓΝΩΣΙΜΟ ΠΑΡΑΡΤΗΜΑ',JSON.stringify(b,null,2));return lines.join('\n');
}
