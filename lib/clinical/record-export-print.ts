import {isCustomSection,readCustomSection} from './visit-layout.ts';
import {optionKeys} from '../../i18n/option-keys.ts';
import {makeTranslator} from '../../i18n/translate.ts';
import {intlLocale,type Locale} from '../../i18n/config.ts';
import type {Messages} from '../../i18n/messages';
import type {PatientBundle} from '../patients/demo-runtime';
import type {VisitDocument} from './visit-document';
import {correctionsFor,effectiveRisk} from './corrections.ts';
import {riskFindings,riskFindingLabel} from './risk-findings.ts';

// Read-only, printable clinical presentation for the fictional-patient environment.
// The complete canonical data backup remains available through patientRecordText.
// No diagnosis, risk conclusion, medication response, or AI claim is inferred.
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const nonempty=(value:unknown)=>value!==null&&value!==undefined&&String(value).trim().length>0;
export function patientRecordPrintableHtml(b:PatientBundle,nonce:string,exportedAt=new Date().toISOString(),options:{locale?:Locale;messages?:Messages}={}){
 const locale=options.locale||'el',t=makeTranslator(locale,options.messages);
const knownLabel=(value:string)=>{const key=optionKeys[value as keyof typeof optionKeys];return key?t(key):value};
const display=(value:unknown)=>nonempty(value)?escapeHtml(value):t('documents.printNotRecorded');
const printDate=(value:unknown)=>{
 if(!nonempty(value))return '—';
 const date=new Date(String(value));
 if(Number.isNaN(date.valueOf()))return escapeHtml(value);
 return escapeHtml(new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:'medium',timeStyle:String(value).includes('T')?'short':undefined,timeZone:'Europe/Athens'}).format(date));
};
const row=(label:string,value:unknown)=>'<div class="row"><dt>'+escapeHtml(label)+'</dt><dd>'+display(value)+'</dd></div>';
const paragraph=(value:unknown)=>'<p class="clinical-text">'+display(value)+'</p>';
const section=(heading:string,content:string)=>'<section class="section"><h2>'+escapeHtml(heading)+'</h2>'+content+'</section>';
const callout=(label:string,value:unknown)=>nonempty(value)?'<div class="note"><strong>'+escapeHtml(label)+'</strong>'+paragraph(value)+'</div>':'';
const sectionNames:Record<string,string>={interview:t('documents.printInitialInterview'),mse:t('clinical.mentalStatusExamination'),assessment:t('clinical.assessment'),plan:t('clinical.treatmentPlan'),review:t('documents.printClinicalReview'),adherence:t('medications.adherence'),effects:t('medications.sideEffects'),functioning:t('clinical.functioning'),history:t('history.title')};
const fieldNames:Record<string,string>={diagnosis:t('clinical.diagnosticHypothesis'),formulation:t('clinical.caseFormulation'),impression:t('documents.printClinicalImpression'),legacy:t('documents.printLegacyEntry')};
const certaintyNames:Record<string,string>={provisional:t('documents.printProvisional'),under_investigation:t('clinical.underInvestigation'),confirmed:t('documents.printConfirmed')};
function renderDocument(document:VisitDocument){
 const fields=document.fields.filter(field=>nonempty(field.text)||Boolean(field.codes?.length));
 if(!fields.length)return paragraph('');
 return fields.map(field=>{
  const title=fieldNames[field.key]||(field.key.startsWith('differential-')?t('clinical.differentialDiagnosis'):knownLabel(field.label));
  const certainty=field.status?t('documents.printCertaintyPrefix')+escapeHtml(certaintyNames[field.status]||field.status):'';
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
 const custom=isCustomSection(sectionEntry.section_key)?readCustomSection(narrative):null;
 const label=custom?.title||sectionNames[sectionEntry.section_key]||sectionEntry.section_key;
 const content=document?.fields?renderDocument(document):paragraph(custom?custom.body:narrative);
 return '<div class="entry"><h3>'+escapeHtml(label)+'</h3>'+content+'</div>';
}
const historyFields=[
 [t('history.psychiatric'),'psychiatric_history'],
 [t('documents.printMedicalHistory'),'medical_history'],
 [t('history.previousTreatments'),'previous_treatments'],
 [t('history.hospitalizations'),'hospitalizations'],
 [t('history.familyHistory'),'family_history'],
 [t('history.substanceUse'),'substance_history'],
 [t('history.socialFunctioning'),'social_functioning'],
 [t('history.allergies'),'allergies']
] as const;
const medicationEvents:Record<string,string>={started:t('common.getStarted'),changed:t('common.change'),stopped:t('medications.stop'),side_effect:t('medications.sideEffect')};
const medicationStatuses:Record<string,string>={active:t('documents.printActive'),stopped:t('documents.printDiscontinued'),ended:t('documents.printCompleted'),scheduled:t('medications.scheduled'),pending:t('documents.printPending')};
const appointmentStatuses:Record<string,string>={scheduled:t('documents.printAppointmentScheduled'),completed:t('documents.printAppointmentCompleted'),cancelled:t('documents.printAppointmentCancelled'),rescheduled:t('documents.printAppointmentRescheduled')};
const appointmentKinds:Record<string,string>={initial_assessment:t('visits.initialAssessment'),follow_up:t('visits.followup'),other:t('common.other')};
function medicalName(b:PatientBundle,id:string,oldState:Record<string,unknown>|null,newState:Record<string,unknown>|null){
 const fromEvent=newState?.medication_name||oldState?.medication_name;
 if(nonempty(fromEvent))return String(fromEvent);
 return b.medications.find(m=>m.id===id)?.medication_name||'Αγωγή';
}
export function patientRecordPrintableHtml(b:PatientBundle,nonce:string,exportedAt=new Date().toISOString()){
 const name=[b.patient.first_name,b.patient.last_name].filter(nonempty).join(' ');
 const title=t('documents.printRecordPrefix')+name;
 const completed=[...b.sessions].filter(s=>s.status==='completed').sort((a,c)=>Date.parse(a.started_at)-Date.parse(c.started_at));
 const draftCount=b.sessions.filter(s=>s.status!=='completed').length;
 const patient=section(t('documents.printPatientDetails'),
  '<dl class="rows">'+row(t('common.fullName'),name)+row(t('patients.age'),b.patient.reported_age)+row(t('patients.amka'),b.patient.amka)+row(t('documents.printPhone'),b.patient.phone)+row('Email',b.patient.email)+row(t('clinical.presentingComplaint'),b.patient.chief_complaint)+'</dl>');
 const history=section(t('history.recordedHistory'),
  ("<p class=\"hint\">"+escapeHtml(t('documents.printHistorySource'))+"</p>")+
  '<dl class="rows">'+historyFields.map(([label,key])=>row(label,b.history?.[key])).join('')+'</dl>');
 const visits=section(t('documents.printVisits'),
  completed.length?completed.map(s=>{
   const sections=b.sections.filter(x=>x.session_id===s.id);
   const continuity=s.continuity?.approved_at?[
    callout(t('documents.printConfirmedState'),s.continuity.clinical_state_summary),
    callout(t('documents.printTreatmentDecision'),s.continuity.treatment_decision),
    callout(t('clinical.nextReview'),s.continuity.next_review_focus),
    callout(t('medications.adherence'),s.continuity.adherence)
   ].join(''):'';
   const risk=effectiveRisk(b.risks.find(r=>r.session_id===s.id),b.corrections,s.id);
   const findings=risk?riskFindings(risk):[];
   const riskBlock=("<div class=\"entry\">"+"<h3>"+escapeHtml(t('clinical.riskAssessment'))+"</h3>")+(
    findings.length?'<ul class="facts">'+findings.map(f=>'<li>'+(f.previousBranch?t('documents.printEarlierBranch'):'')+escapeHtml(knownLabel(f.label))+': '+escapeHtml(knownLabel(riskFindingLabel(f)))+(f.note?' · '+escapeHtml(f.note):'')+'</li>').join('')+'</ul>':("<p class=\"hint\">"+escapeHtml(t('documents.printNoVisitRisk'))+"</p>"))+
    (risk?.clinical_note?paragraph(risk.clinical_note):'')+'</div>';
   const additions=b.addenda.filter(a=>a.session_id===s.id).map(a=>'<div class="entry"><h3>'+escapeHtml(a.kind==='correction'?t('documents.printCorrection'):t('documents.printAddendum'))+' · '+printDate(a.created_at)+'</h3>'+callout(t('documents.printReason'),a.reason)+paragraph(a.content)+'</div>').join('');
   const corrections=correctionsFor(b.corrections,s.id);
   const corrected=corrections.length?'<p class="hint">'+escapeHtml(t('documents.printCorrectionsCount',{count:corrections.length}))+'</p>':'';
   return '<article class="visit"><header><h3>'+escapeHtml(s.session_type==='initial_assessment'?t('visits.initialAssessment'):t('visits.followup'))+'</h3><p>'+printDate(s.started_at)+t('documents.printFinalized')+(s.completed_at?t('documents.printFinalizedAt')+printDate(s.completed_at):'')+'</p></header>'+continuity+sections.map(item=>renderRecordedSection(b,s.id,item)).join('')+riskBlock+additions+corrected+'</article>';
  }).join(''):'<p class="hint">Δεν υπάρχουν ολοκληρωμένες επισκέψεις.</p>');
 const meds=section('Καταγεγραμμένη αγωγή κατά την εξαγωγή',
 b.medications.length?'<ul class="facts">'+b.medications.map(m=>'<li><strong>'+display(m.medication_name)+'</strong> · '+display(m.dose)+' '+display(m.unit)+' · '+display(m.frequency)+' · '+escapeHtml(medicationStatuses[m.status]||m.status)+t('documents.printFrom')+printDate(m.effective_from||m.started_at)+(m.ended_at?t('documents.printUntil')+printDate(m.ended_at):'')+'</li>').join('')+'</ul>':("<p class=\"hint\">"+escapeHtml(t('documents.printNoMedication'))+"</p>"));
 const timeline=section(t('documents.printMedicationChanges'),
 b.medicationEvents.length?'<ul class="facts">'+[...b.medicationEvents].sort((a,c)=>String(a.effective_on).localeCompare(String(c.effective_on))).map(event=>'<li>'+printDate(event.effective_on)+' · '+escapeHtml(medicationEvents[event.event_type]||event.event_type)+' · '+escapeHtml(medicalName(b,event.medication_id,event.previous_state,event.new_state))+(event.reason?' · '+escapeHtml(event.reason):'')+'</li>').join('')+'</ul>':("<p class=\"hint\">"+escapeHtml(t('documents.printNoMedicationEvents'))+"</p>"));
 const effects=section(t('documents.printSideEffects'),
 b.medicationSideEffects.length?'<ul class="facts">'+b.medicationSideEffects.map(e=>'<li>'+printDate(e.noted_on)+' · '+escapeHtml(medicalName(b,e.medication_id,null,null))+' · '+display(e.effect_text)+(e.resolved_on?t('documents.printResolvedAt')+printDate(e.resolved_on):t('documents.printNoEndDate'))+'</li>').join('')+'</ul>':("<p class=\"hint\">"+escapeHtml(t('documents.printNoSideEffects'))+"</p>"));
 const measurements=b.assessments.filter(a=>a.status==='completed'&&a.score!==null).sort((a,c)=>Date.parse(a.completed_at||'')-Date.parse(c.completed_at||''));
 const psychometrics=section(t('psychometrics.measures'),measurements.length?'<ul class="facts">'+measurements.map(a=>'<li><strong>'+escapeHtml(a.instrument)+' · '+display(a.score)+'</strong> · '+printDate(a.completed_at)+(a.item9_review?(a.item9_reviewed_at?t('documents.printItemNineReviewed'):t('documents.printItemNinePending')):'')+(a.answers?.length?t('documents.printAnswers')+a.answers.map(display).join(', '):'')+'</li>').join('')+'</ul>':("<p class=\"hint\">"+escapeHtml(t('documents.printNoMeasures'))+"</p>"));
 const appointments=section(t('calendar.appointment'),b.appointments.length?'<ul class="facts">'+[...b.appointments].sort((a,c)=>Date.parse(a.scheduled_start)-Date.parse(c.scheduled_start)).map(a=>'<li>'+printDate(a.scheduled_start)+' · '+escapeHtml(appointmentKinds[a.appointment_type]||a.appointment_type)+' · '+escapeHtml(appointmentStatuses[a.status]||a.status)+'</li>').join('')+'</ul>':'<p class="hint">Δεν υπάρχουν καταχωρισμένα ραντεβού.</p>');
 const summary='<div class="intro"><p><strong>Προέλευση:</strong> Κλινικές καταγραφές και πληροφορίες του υποθετικού φακέλου κατά την ημερομηνία εξαγωγής. Πρόκειται για παρουσίαση υπάρχοντος υλικού, όχι νέα ιατρική γνωμάτευση ή πρόταση AI.</p>'+
  (draftCount?'<p><strong>Μη ολοκληρωμένες καταγραφές:</strong> '+draftCount+' δεν περιλαμβάνονται σε αυτή την εκτυπώσιμη έκδοση επειδή δεν έχουν οριστικοποιηθεί. Διατηρούνται στο τεχνικό αντίγραφο δεδομένων.</p>':'')+'</div>';
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
 const html=['<!doctype html><html lang="'+locale+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<title>',escapeHtml(title),'</title><style nonce="',escapeHtml(nonce),'">',stylesheet,'</style></head><body>',
 ("<div class=\"toolbar\">"+"<span>"+escapeHtml(t('documents.printToolbar'))+"</span>"+"<button type=\"button\" id=\"print-document\">"+escapeHtml(t('documents.printButton'))+"</button>"+"</div>"),
 ("<main class=\"paper\">"+"<div class=\"brand\">"+"Ψ · NOIMA"+"</div>"+"<h1>"+escapeHtml(t('documents.printTitle'))+"</h1>"+"<p class=\"sub\">"+escapeHtml(t('documents.printFictionalPrefix'))),escapeHtml(name),t('documents.printExportedPrefix'),printDate(exportedAt),'</p>',
 summary,patient,history,visits,meds,timeline,effects,psychometrics,appointments,
 ("<div class=\"footer\">"+escapeHtml(t('documents.printFooter'))+"</div>"),
 '</main><script nonce="',escapeHtml(nonce),'">document.getElementById("print-document").addEventListener("click",()=>window.print());</script></body></html>'].join('');
 return html;
}
