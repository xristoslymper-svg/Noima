import type {PatientBundle} from '../patients/demo-runtime';
import type {VisitDocument} from './visit-document';
import {correctionsFor,effectiveRisk} from './corrections';
import {riskFindings,riskFindingLabel} from './risk-findings';

// Read-only, printable clinical presentation for the fictional-patient environment.
// The complete canonical data backup remains available through patientRecordText.
// No diagnosis, risk conclusion, medication response, or AI claim is inferred.
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const nonempty=(value:unknown)=>value!==null&&value!==undefined&&String(value).trim().length>0;
const display=(value:unknown)=>nonempty(value)?escapeHtml(value):'Δεν καταγράφηκε';
const printDate=(value:unknown)=>{
 if(!nonempty(value))return '—';
 const date=new Date(String(value));
 if(Number.isNaN(date.valueOf()))return escapeHtml(value);
 return escapeHtml(new Intl.DateTimeFormat('el-GR',{dateStyle:'medium',timeStyle:String(value).includes('T')?'short':undefined,timeZone:'Europe/Athens'}).format(date));
};
const row=(label:string,value:unknown)=>'<div class="row"><dt>'+escapeHtml(label)+'</dt><dd>'+display(value)+'</dd></div>';
const paragraph=(value:unknown)=>'<p class="clinical-text">'+display(value)+'</p>';
const section=(heading:string,content:string)=>'<section class="section"><h2>'+escapeHtml(heading)+'</h2>'+content+'</section>';
const callout=(label:string,value:unknown)=>nonempty(value)?'<div class="note"><strong>'+escapeHtml(label)+'</strong>'+paragraph(value)+'</div>':'';
const sectionNames:Record<string,string>={interview:'Παρούσα εικόνα / συνέντευξη',mse:'Εξέταση ψυχικής κατάστασης (MSE)',assessment:'Κλινική εκτίμηση',plan:'Θεραπευτικό πλάνο',review:'Επόμενος κλινικός έλεγχος',adherence:'Λήψη αγωγής',effects:'Παρενέργειες',functioning:'Λειτουργικότητα',history:'Ιστορικό'};
const fieldNames:Record<string,string>={diagnosis:'Διάγνωση ή διαγνωστική υπόθεση',formulation:'Διατύπωση περίπτωσης',impression:'Κλινική αποτίμηση',legacy:'Προϋπάρχουσα κλινική καταγραφή'};
const certaintyNames:Record<string,string>={provisional:'Προσωρινή',under_investigation:'Υπό διερεύνηση',confirmed:'Επιβεβαιωμένη'};
function renderDocument(document:VisitDocument){
 const fields=document.fields.filter(field=>nonempty(field.text)||Boolean(field.codes?.length));
 if(!fields.length)return paragraph('');
 return fields.map(field=>{
  const title=fieldNames[field.key]||(field.key.startsWith('differential-')?'Διαφορική διάγνωση':field.label);
  const certainty=field.status?' · Βεβαιότητα: '+escapeHtml(certaintyNames[field.status]||field.status):'';
  const codes=field.codes?.length?' · ICD-10: '+field.codes.map(c=>escapeHtml(c.code)).join(', '):'';
  return '<div class="clinical-field"><h4>'+escapeHtml(title)+certainty+codes+'</h4>'+paragraph(field.text)+'</div>';
 }).join('');
}
function renderRecordedSection(b:PatientBundle,sessionId:string,sectionEntry:PatientBundle['sections'][number]){
 let correction:unknown=undefined;
 for(const item of correctionsFor(b.corrections,sessionId)){
  const change=item.patch?.[sectionEntry.section_key];
  if(change&&Object.prototype.hasOwnProperty.call(change,'after'))correction=change.after;
 }
 const document=typeof correction==='string'?null:correction&&typeof correction==='object'&&'kind' in correction?(correction as VisitDocument):sectionEntry.document;
 const narrative=typeof correction==='string'?correction:sectionEntry.content;
 const label=sectionNames[sectionEntry.section_key]||sectionEntry.section_key;
 const content=document?.fields?renderDocument(document):paragraph(narrative);
 return '<div class="entry"><h3>'+escapeHtml(label)+'</h3>'+content+'</div>';
}
const historyFields=[
 ['Ψυχιατρικό ιστορικό','psychiatric_history'],
 ['Ατομικό ιατρικό ιστορικό','medical_history'],
 ['Προηγούμενες θεραπείες','previous_treatments'],
 ['Νοσηλείες','hospitalizations'],
 ['Οικογενειακό ιστορικό','family_history'],
 ['Χρήση ουσιών','substance_history'],
 ['Κοινωνική λειτουργικότητα','social_functioning'],
 ['Αλλεργίες','allergies']
] as const;
const medicationEvents:Record<string,string>={started:'Έναρξη',changed:'Αλλαγή',stopped:'Διακοπή',side_effect:'Παρενέργεια'};
const medicationStatuses:Record<string,string>={active:'Ενεργή',stopped:'Διακομμένη',ended:'Ολοκληρωμένη',scheduled:'Προγραμματισμένη',pending:'Εκκρεμής'};
const appointmentStatuses:Record<string,string>={scheduled:'Προγραμματισμένο',completed:'Ολοκληρωμένο',cancelled:'Ακυρωμένο',rescheduled:'Μετακινήθηκε'};
const appointmentKinds:Record<string,string>={initial_assessment:'Αρχική αξιολόγηση',follow_up:'Επανεξέταση',other:'Άλλο'};
function medicalName(b:PatientBundle,id:string,oldState:Record<string,unknown>|null,newState:Record<string,unknown>|null){
 const fromEvent=newState?.medication_name||oldState?.medication_name;
 if(nonempty(fromEvent))return String(fromEvent);
 return b.medications.find(m=>m.id===id)?.medication_name||'Αγωγή';
}
export function patientRecordPrintableHtml(b:PatientBundle,nonce:string,exportedAt=new Date().toISOString()){
 const name=[b.patient.first_name,b.patient.last_name].filter(nonempty).join(' ');
 const title='Κλινικός φάκελος · '+name;
 const completed=[...b.sessions].filter(s=>s.status==='completed').sort((a,c)=>Date.parse(a.started_at)-Date.parse(c.started_at));
 const draftCount=b.sessions.filter(s=>s.status!=='completed').length;
 const patient=section('Στοιχεία ασθενούς',
  '<dl class="rows">'+row('Ονοματεπώνυμο',name)+row('Ηλικία',b.patient.reported_age)+row('ΑΜΚΑ',b.patient.amka)+row('Τηλέφωνο',b.patient.phone)+row('Email',b.patient.email)+row('Λόγος προσέλευσης',b.patient.chief_complaint)+'</dl>');
 const history=section('Καταγεγραμμένο ιστορικό',
  '<p class="hint">Οι απαντήσεις που έχουν υποβληθεί από τον ασθενή διατηρούν διαφορετική προέλευση από τις κλινικά καταχωρισμένες πληροφορίες.</p>'+
  '<dl class="rows">'+historyFields.map(([label,key])=>row(label,b.history?.[key])).join('')+'</dl>');
 const visits=section('Κλινικές επισκέψεις',
  completed.length?completed.map(s=>{
   const sections=b.sections.filter(x=>x.session_id===s.id);
   const continuity=s.continuity?.approved_at?[
    callout('Επιβεβαιωμένη κλινική εικόνα',s.continuity.clinical_state_summary),
    callout('Θεραπευτική απόφαση',s.continuity.treatment_decision),
    callout('Επόμενος έλεγχος',s.continuity.next_review_focus),
    callout('Λήψη αγωγής',s.continuity.adherence)
   ].join(''):'';
   const risk=effectiveRisk(b.risks.find(r=>r.session_id===s.id),b.corrections,s.id);
   const findings=risk?riskFindings(risk):[];
   const riskBlock='<div class="entry"><h3>Εκτίμηση κινδύνου</h3>'+(
    findings.length?'<ul class="facts">'+findings.map(f=>'<li>'+(f.previousBranch?'Παλαιότερη διαδρομή · ':'')+escapeHtml(f.label)+': '+escapeHtml(riskFindingLabel(f))+(f.note?' · '+escapeHtml(f.note):'')+'</li>').join('')+'</ul>':'<p class="hint">Δεν υπάρχει καταχωρισμένη εκτίμηση κινδύνου για αυτή την επίσκεψη.</p>')+
    (risk?.clinical_note?paragraph(risk.clinical_note):'')+'</div>';
   const additions=b.addenda.filter(a=>a.session_id===s.id).map(a=>'<div class="entry"><h3>'+escapeHtml(a.kind==='correction'?'Μεταγενέστερη διόρθωση':'Μεταγενέστερη προσθήκη')+' · '+printDate(a.created_at)+'</h3>'+callout('Αιτιολογία',a.reason)+paragraph(a.content)+'</div>').join('');
   const corrections=correctionsFor(b.corrections,s.id);
   const corrected=corrections.length?'<p class="hint">Υπάρχουν '+corrections.length+' δομημένες διορθώσεις, οι οποίες εφαρμόζονται στην παρουσίαση των αντίστοιχων πεδίων.</p>':'';
   return '<article class="visit"><header><h3>'+escapeHtml(s.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επανεξέταση')+'</h3><p>'+printDate(s.started_at)+' · Οριστικοποιημένη καταγραφή'+(s.completed_at?' · Οριστικοποίηση: '+printDate(s.completed_at):'')+'</p></header>'+continuity+sections.map(item=>renderRecordedSection(b,s.id,item)).join('')+riskBlock+additions+corrected+'</article>';
  }).join(''):'<p class="hint">Δεν υπάρχουν ολοκληρωμένες επισκέψεις.</p>');
 const meds=section('Καταγεγραμμένη αγωγή κατά την εξαγωγή',
 b.medications.length?'<ul class="facts">'+b.medications.map(m=>'<li><strong>'+display(m.medication_name)+'</strong> · '+display(m.dose)+' '+display(m.unit)+' · '+display(m.frequency)+' · '+escapeHtml(medicationStatuses[m.status]||m.status)+' · Από '+printDate(m.effective_from||m.started_at)+(m.ended_at?' · Έως '+printDate(m.ended_at):'')+'</li>').join('')+'</ul>':'<p class="hint">Δεν υπάρχει καταγεγραμμένη αγωγή.</p>');
 const timeline=section('Ιστορικό αλλαγών αγωγής',
 b.medicationEvents.length?'<ul class="facts">'+[...b.medicationEvents].sort((a,c)=>String(a.effective_on).localeCompare(String(c.effective_on))).map(event=>'<li>'+printDate(event.effective_on)+' · '+escapeHtml(medicationEvents[event.event_type]||event.event_type)+' · '+escapeHtml(medicalName(b,event.medication_id,event.previous_state,event.new_state))+(event.reason?' · '+escapeHtml(event.reason):'')+'</li>').join('')+'</ul>':'<p class="hint">Δεν υπάρχουν καταχωρισμένα συμβάντα αγωγής.</p>');
 const effects=section('Καταγεγραμμένες παρενέργειες',
 b.medicationSideEffects.length?'<ul class="facts">'+b.medicationSideEffects.map(e=>'<li>'+printDate(e.noted_on)+' · '+escapeHtml(medicalName(b,e.medication_id,null,null))+' · '+display(e.effect_text)+(e.resolved_on?' · Λήξη: '+printDate(e.resolved_on):' · Χωρίς καταχωρισμένη ημερομηνία λήξης')+'</li>').join('')+'</ul>':'<p class="hint">Δεν έχουν καταγραφεί παρενέργειες.</p>');
 const measurements=b.assessments.filter(a=>a.status==='completed'&&a.score!==null).sort((a,c)=>Date.parse(a.completed_at||'')-Date.parse(c.completed_at||''));
 const psychometrics=section('Ψυχομετρικές μετρήσεις',measurements.length?'<ul class="facts">'+measurements.map(a=>'<li><strong>'+escapeHtml(a.instrument)+' · '+display(a.score)+'</strong> · '+printDate(a.completed_at)+(a.item9_review?(a.item9_reviewed_at?' · Ανασκόπηση στοιχείου 9 καταχωρίστηκε':' · Εκκρεμεί ανασκόπηση στοιχείου 9'):'')+(a.answers?.length?' · Απαντήσεις: '+a.answers.map(display).join(', '):'')+'</li>').join('')+'</ul>':'<p class="hint">Δεν υπάρχουν ολοκληρωμένες μετρήσεις.</p>');
 const appointments=section('Ραντεβού',b.appointments.length?'<ul class="facts">'+[...b.appointments].sort((a,c)=>Date.parse(a.scheduled_start)-Date.parse(c.scheduled_start)).map(a=>'<li>'+printDate(a.scheduled_start)+' · '+escapeHtml(appointmentKinds[a.appointment_type]||a.appointment_type)+' · '+escapeHtml(appointmentStatuses[a.status]||a.status)+'</li>').join('')+'</ul>':'<p class="hint">Δεν υπάρχουν καταχωρισμένα ραντεβού.</p>');
 const summary='<div class="intro"><p><strong>Προέλευση:</strong> Κλινικές καταγραφές και πληροφορίες του υποθετικού φακέλου κατά την ημερομηνία εξαγωγής. Πρόκειται για παρουσίαση υπάρχοντος υλικού, όχι νέα ιατρική γνωμάτευση ή πρόταση AI.</p>'+
  (draftCount?'<p><strong>Πρόχειρες καταγραφές:</strong> '+draftCount+' δεν περιλαμβάνονται σε αυτή την εκτυπώσιμη έκδοση επειδή δεν έχουν οριστικοποιηθεί. Διατηρούνται στο τεχνικό αντίγραφο δεδομένων.</p>':'')+'</div>';
 const stylesheet=[
 '@page{size:A4;margin:16mm 14mm}',
 '*{box-sizing:border-box}',
 'html{font-size:14px}',
 'body{margin:0;background:#f5f7f4;color:#273c32;font-family:Arial,Helvetica,sans-serif;line-height:1.55}',
 '.toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #dce6df;padding:12px 26px;display:flex;gap:12px;justify-content:space-between;align-items:center}',
 '.toolbar button{background:#2f765e;color:#fff;border:0;border-radius:10px;padding:11px 17px;cursor:pointer;font-size:14px;font-weight:700}',
 '.toolbar span{font-size:12px;color:#68796f}',
 '.paper{max-width:820px;margin:22px auto 44px;padding:38px 48px;background:white;border:1px solid #e0e8e2;box-shadow:0 8px 35px #142d1812;border-radius:14px}',
 '.brand{font-size:25px;font-family:Georgia,serif;color:#326c54;font-weight:700}',
 'h1{margin:10px 0 5px;font:700 28px Georgia,serif;line-height:1.2;color:#253d31}',
 '.sub{color:#667b6e;font-size:12px;margin:0 0 20px}',
 '.intro{border-left:3px solid #8aad98;background:#f5f9f5;padding:10px 15px;font-size:12px;margin:15px 0 24px}',
 '.section{margin-top:27px;page-break-inside:auto}',
 '.section h2{font-size:18px;color:#2c5840;border-bottom:1px solid #dfe7e0;padding-bottom:7px;margin:0 0 13px}',
 '.rows{margin:0}.row{display:grid;grid-template-columns:145px 1fr;gap:15px;padding:8px 0;border-bottom:1px solid #eef1ec}.row dt{font-size:12px;color:#6c8072}.row dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}',
 '.visit{border:1px solid #e0e9e2;border-radius:10px;padding:18px 19px;margin:15px 0;break-inside:avoid-page}',
 '.visit>header{border-bottom:1px solid #e4ebe6;margin-bottom:14px;padding-bottom:8px}',
 '.visit>header h3{font-size:16px;margin:0;color:#2f5944}.visit>header p{font-size:12px;color:#728376;margin:5px 0 0}',
 '.entry{margin:13px 0 16px}.entry h3{font-size:13px;color:#2b5944;margin:0 0 7px}',
 '.clinical-field{padding:8px 0}.clinical-field h4{font-size:12px;color:#466251;margin:0 0 4px}',
 '.clinical-text{white-space:pre-wrap;overflow-wrap:anywhere;margin:5px 0 10px;font-size:13px}',
 '.note{border-left:3px solid #d4e4d7;margin:11px 0;padding:3px 12px}.note strong{font-size:12px;color:#42624d}',
 '.facts{margin:7px 0 0;padding-left:20px}.facts li{padding:4px 0;overflow-wrap:anywhere}',
 '.hint{font-size:12px;color:#718276;line-height:1.5}',
 '.footer{font-size:11px;color:#738577;text-align:center;margin-top:35px;border-top:1px solid #dce6df;padding-top:13px}',
 '@media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}.paper{margin:0;padding:0;border:0;box-shadow:none;max-width:none;border-radius:0}.visit{break-inside:auto}.section h2,.visit>header{break-after:avoid}}',
 '@media(max-width:650px){.paper{padding:22px;margin:0;border:0;border-radius:0}.row{grid-template-columns:1fr;gap:1px}.toolbar{flex-wrap:wrap}}'
 ].join('');
 const html=['<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<title>',escapeHtml(title),'</title><style nonce="',escapeHtml(nonce),'">',stylesheet,'</style></head><body>',
 '<div class="toolbar"><span>Εκτυπώσιμη έκδοση · Αποθήκευση ως PDF από τις επιλογές εκτύπωσης</span><button type="button" id="print-document">Εκτύπωση / PDF</button></div>',
 '<main class="paper"><div class="brand">Ψ · NOIMA</div><h1>Κλινικός φάκελος</h1><p class="sub">ΔΟΚΙΜΑΣΤΙΚΑ ΔΕΔΟΜΕΝΑ · ',escapeHtml(name),' · Εξαγωγή ',printDate(exportedAt),'</p>',
 summary,patient,history,visits,meds,timeline,effects,psychometrics,appointments,
 '<div class="footer">NOIMA · Δοκιμαστική εξαγωγή υποθετικού φακέλου · Ελέγξτε το περιεχόμενο πριν από οποιαδήποτε κοινοποίηση.</div>',
 '</main><script nonce="',escapeHtml(nonce),'">document.getElementById("print-document").addEventListener("click",()=>window.print());</script></body></html>'].join('');
 return html;
}
