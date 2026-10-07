import type {PatientBundle} from '../patients/demo-runtime';
import type {VisitDocument} from './visit-document';
import type {SummaryContext,Finding,Evidence} from './summary-context';

export type CardItem={text:string;source_ids:string[];role?:'course'|'plan'};
export type ClinicalCard={date:string|null;diagnoses:CardItem[];medications:CardItem[];mse:CardItem[];changes:CardItem[];changeLabels:string[];notes:CardItem[];alerts:Finding[];corrections:Finding[];sources:Evidence[];synthesized:boolean};
// Never cut a clinical sentence. Keep the primary fact visible even when long.
export function clinicalCardPreview(items:CardItem[],limit:number){
 const preview:CardItem[]=[],rest:CardItem[]=[];let words=0;
 for(const item of items){const count=item.text.trim().split(/\s+/u).length;
  const required=!preview.length||Boolean(item.role&&!preview.some(p=>p.role===item.role));
  if(required||words+count<=limit){preview.push(item);words+=count}else rest.push(item);
 }
 return {preview,rest};
}
export function buildClinicalCard(bundle:PatientBundle,context:SummaryContext,findings:Finding[]=[],synthesized=false):ClinicalCard{
 const time=(id:string)=>{const s=bundle.sessions.find(s=>s.id===id)!;return bundle.appointments.find(a=>a.session_id===id)?.scheduled_start||s.started_at||s.completed_at||''};
 const latest=[...bundle.sessions].filter(s=>s.status==='completed').sort((a,b)=>Date.parse(time(b.id))-Date.parse(time(a.id)))[0];
 const narrativeCorrections=new Set(context.layers.corrections.filter(c=>c.kind==='addendum').map(c=>c.session_id));
 function section(kind:'assessment'|'mse',sessionId=latest?.id){
  const row=bundle.sections.find(s=>s.session_id===sessionId&&s.section_key===kind);
  if(!row||narrativeCorrections.has(row.session_id))return null;
  let doc=row.document;
  for(const c of [...(bundle.corrections||[])].filter(c=>c.session_id===row.session_id).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id))){
   const after=c.patch?.[kind]?.after;
   if(typeof after==='string')doc=null;
   else if(after&&typeof after==='object'&&'kind' in after)doc=after as VisitDocument;
  }
  const source=context.sources.find(s=>s.id==='section:'+row.id);
  return {doc:doc?.kind===kind?doc:null,content:source?String(source.content):'',source_ids:[...(source?[source.id]:[]),...context.layers.corrections.filter(c=>c.session_id===row.session_id).map(c=>c.id)]};
 }
 const labels:Record<string,string>={appearance:'Εμφάνιση & συμπεριφορά',speech:'Λόγος',mood:'Συναίσθημα',affect:'Συναισθηματική έκφραση',thought_process:'Ροή σκέψης',thought_content:'Περιεχόμενο σκέψης',perception:'Αντίληψη',cognition:'Γνωστικές λειτουργίες',insight:'Επίγνωση',judgment:'Κρίση',impulse_control:'Έλεγχος παρορμήσεων',reliability:'Αξιοπιστία'};
 const diagnosticSessions=[...bundle.sessions].filter(s=>s.status==='completed').sort((a,b)=>Date.parse(time(b.id))-Date.parse(time(a.id)));
 const diagnosticSession=diagnosticSessions.find(s=>section('assessment',s.id)?.doc?.fields.some(f=>(f.key==='diagnosis'||f.key.startsWith('differential'))&&(f.codes?.length||f.text.trim())));
 const assessment=diagnosticSession?section('assessment',diagnosticSession.id):null,mse=section('mse');
 const statuses={confirmed:'επιβεβαιωμένη',provisional:'προσωρινή',under_investigation:'υπό διερεύνηση'};
 const diagnoses=assessment?.doc?.fields.filter(f=>f.key==='diagnosis'||f.key.startsWith('differential')).sort((a,b)=>Number(b.key==='diagnosis')-Number(a.key==='diagnosis')).flatMap(f=>{
  const status=f.status?statuses[f.status]:f.key.startsWith('differential')?'υπό διερεύνηση':'κατάσταση μη ορισμένη';
  const text=f.codes?.length?f.codes.map(c=>c.code+' · '+c.label).join('; '):f.text.trim();
  return text?[{text:(f.key.startsWith('differential')?'Διαφορική: ':'')+text+' · '+status+(diagnosticSession?.id!==latest?.id?' · τελευταία καταγραφή '+time(diagnosticSession!.id).slice(0,10):''),source_ids:assessment.source_ids}]:[];
 })||[];
 const medications=bundle.clinical_day&&bundle.clinical_day!==context.day?[]:bundle.medications.filter(m=>m.status==='active').map(m=>({text:[m.medication_name,m.dose+' '+m.unit,m.frequency].filter(Boolean).join(' · '),source_ids:['medication:'+m.id]}));
 const mseOrder=['mood','affect','thought_content','thought_process','perception','speech','appearance','cognition','insight','judgment','impulse_control','reliability','legacy'];
 const mseItems=mse?.doc?mse.doc.fields.filter(f=>f.text.trim()&&f.review!=='not_assessed').sort((a,b)=>Number(b.review==='changed')-Number(a.review==='changed')||mseOrder.indexOf(a.key)-mseOrder.indexOf(b.key)).map(f=>({text:(labels[f.key]||f.label)+': '+f.text,source_ids:mse.source_ids})):mse?.content?[{text:mse.content,source_ids:mse.source_ids}]:[];
 const previous=[...bundle.sessions].filter(s=>s.status==='completed'&&s.id!==latest?.id).sort((a,b)=>Date.parse(time(b.id))-Date.parse(time(a.id)))[0];
 const before=previous?section('mse',previous.id):null;
 const changeLabels=mse?.doc?.fields.filter(f=>f.key!=='legacy'&&f.review!=='not_assessed'&&f.text.trim()&&before?.doc?.fields.some(old=>old.key===f.key&&old.text.trim()&&old.text!==f.text)).map(f=>labels[f.key]||f.label)||[];
 const changes=context.findings.filter(f=>f.key.startsWith('mse-change:')).map(f=>({text:f.text,source_ids:f.source_ids}));
 const noteSources=context.sources.filter(s=>s.kind==='session_section'&&s.session_id===latest?.id&&!narrativeCorrections.has(s.session_id)&&['interview','plan','review'].includes(s.section_key||''));
 const recorded=noteSources.flatMap(s=>Array.from(new Intl.Segmenter('el',{granularity:'sentence'}).segment(String(s.content)),sentence=>({text:sentence.segment.trim(),source_ids:[s.id,...(s.required_correction_ids||[])],role:s.section_key==='interview'?'course' as const:'plan' as const}))).filter(i=>i.text);
 const plan=recorded.filter(i=>i.role==='plan');
 // The next step is the doctor's complete record, not an optional model detail.
 const nextStep:CardItem[]=plan.length?[{text:plan.map(i=>i.text).join(' '),source_ids:[...new Set(plan.flatMap(i=>i.source_ids))],role:'plan'}]:[];
 const notes:CardItem[]=[...(synthesized?findings.filter(f=>f.origin==='synthesis'&&(f.theme!=='plan'||!plan.length)).map(f=>({text:f.text,source_ids:f.source_ids,role:'course' as const})):recorded.filter(i=>i.role==='course')),...nextStep];
 return {date:latest?time(latest.id):null,diagnoses,medications,mse:mseItems,changes,changeLabels,notes,alerts:context.findings.filter(f=>f.attention),corrections:context.findings.filter(f=>f.key.startsWith('correction:')&&!f.attention),sources:context.sources,synthesized};
}
