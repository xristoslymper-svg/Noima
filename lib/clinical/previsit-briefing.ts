import type {PatientBundle} from '../patients/demo-runtime';
import type {SummaryContext, Evidence, Finding} from './summary-context';
import type {VisitDocument} from './visit-document';
import {mseFieldSentence} from './mse-language.ts';
import {riskFindings} from './risk-findings.ts';

export type BriefItem={text:string;source_ids:string[];date?:string};
export type PrevisitBriefing={
 diagnoses:BriefItem[];differential:BriefItem[];medications:BriefItem[];
 narrative:BriefItem[];narrativeSynthesized:boolean;context:BriefItem[];history:BriefItem[];
 mse:BriefItem[];mseDate:string|null;safetyFlags:BriefItem[];
 ideation:{value:'yes'|'no'|'unknown'|'not_assessed'|'missing'|'review';date:string|null;source_ids:string[];qualifier?:string};
};
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
// This only separates already documented prose for presentation. It NEVER classifies risk.
const riskMention=/(αυτοκτον|αυτοτραυμα|ετεροκαταστροφ|suicid|self.harm|σκέψ.{0,40}θανάτ|death wish)/iu;
const sentences=(value:string)=>Array.from(new Intl.Segmenter('el',{granularity:'sentence'}).segment(value),s=>s.segment.trim()).filter(Boolean);
const refs=(source:Evidence,context:SummaryContext)=>[...new Set([source.id,...(source.required_correction_ids||[]),...context.layers.corrections.filter(c=>c.session_id===source.session_id&&c.kind==='addendum').map(c=>c.id)])];
const statuses={confirmed:'επιβεβαιωμένη',provisional:'προσωρινή',under_investigation:'υπό διερεύνηση'};

/** Read-only projection of the same corrected evidence as the clinical summary.
 * No model may supply diagnoses, doses, MSE or binary risk status. No writes on read.
 */
export function buildPrevisitBriefing(bundle:PatientBundle,context:SummaryContext,medications:BriefItem[],findings:Finding[]=[],synthesized=false):PrevisitBriefing{
 const completed=[...bundle.sessions].filter(s=>s.status==='completed').sort((a,b)=>Date.parse(b.started_at||b.completed_at||'')-Date.parse(a.started_at||a.completed_at||'')||a.id.localeCompare(b.id));
 const latest=completed[0];
 const date=(id:string)=>{const s=completed.find(s=>s.id===id);return s?.started_at||s?.completed_at||undefined};
 const correctedParents=new Set(context.layers.corrections.filter(c=>c.kind==='addendum').map(c=>c.session_id));
 function effectiveSection(sessionId:string,kind:string){
  const source=context.sources.find(s=>s.kind==='session_section'&&s.session_id===sessionId&&s.section_key===kind);
  if(!source||correctedParents.has(sessionId))return null;
  let doc=bundle.sections.find(s=>s.id===source.record_id)?.document;
  for(const correction of [...(bundle.corrections||[])].filter(c=>c.session_id===sessionId).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id))){
   const after=correction.patch?.[kind]?.after;
   if(typeof after==='string')doc=null;
   else if(after&&typeof after==='object'&&'kind' in after)doc=after as VisitDocument;
  }
  return {source,doc:doc?.kind===kind?doc:null};
 }
 const diagnoses:BriefItem[]=[],differential:BriefItem[]=[];
 const assessment=completed.map(s=>effectiveSection(s.id,'assessment')).find(s=>s?.doc?.fields.some(f=>(f.key==='diagnosis'||f.key.startsWith('differential'))&&(text(f.text)||f.codes?.length)));
 for(const field of assessment?.doc?.fields||[]){
  if(field.key!=='diagnosis'&&!field.key.startsWith('differential'))continue;
  const codes=(field.codes||[]).map(c=>[c.code,c.label].filter(Boolean).join(' · '));
  const note=text(field.text);
  const body=[...codes,...(note&&!(field.codes||[]).some(c=>text(c.label)===note)?[note]:[])].filter(Boolean);
  if(!body.length)continue;
  const certainty=field.status?statuses[field.status]:field.key==='diagnosis'?'κατάσταση μη ορισμένη':'υπό διερεύνηση';
  (field.key==='diagnosis'?diagnoses:differential).push({text:[...new Set(body),certainty].join(' · '),date:assessment!.source.date,source_ids:refs(assessment!.source,context)});
 }
 // Find the last actually recorded completed MSE, never fill missing domains from older visits.
 const mseSection=completed.map(s=>effectiveSection(s.id,'mse')).find(s=>s&&(s.doc?s.doc.fields.some(f=>text(f.text)&&f.review!=='not_assessed'):text(s.source.content)));
 const order=['mood','affect','thought_process','thought_content','perception','speech','appearance','cognition','insight','judgment','impulse_control','reliability','legacy'];
 const mse:BriefItem[]=mseSection?.doc?[...mseSection.doc.fields].filter(f=>text(f.text)&&f.review!=='not_assessed').sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key)).map(f=>({text:mseFieldSentence(f),source_ids:refs(mseSection.source,context)})):mseSection?[{text:text(mseSection.source.content),source_ids:refs(mseSection.source,context)}]:[];
 const patientSources=context.sources.filter(s=>s.kind==='session_section'&&['interview','functioning'].includes(s.section_key||'')&&!correctedParents.has(s.session_id));
 const latestReport=completed.find(s=>patientSources.some(p=>p.session_id===s.id&&text(p.content)));
 const recorded=patientSources.filter(s=>s.session_id===latestReport?.id).flatMap(s=>sentences(text(s.content)).filter(t=>!riskMention.test(t)).map(t=>({text:t,source_ids:refs(s,context),date:s.date})));
 // Only previously verified course sentences with report/context evidence qualify.
 // Mixed diagnosis/risk/plan sentences stay in their dedicated source views.
 const allowed=(s:Evidence)=>s.kind==='session_section'&&['interview','functioning'].includes(s.section_key||'')||['history','patient_context','confirmed_context','structured_correction','addendum'].includes(s.kind);
 const narrative=synthesized?findings.filter(f=>f.origin==='synthesis'&&['course','general',undefined].includes(f.theme)&&!riskMention.test(f.text)&&f.source_ids.length>0&&f.source_ids.every(id=>{const s=context.sources.find(s=>s.id===id);return s&&allowed(s)&&!(s.kind==='confirmed_context'&&object(s.content).status==='resolved')})&&f.source_ids.some(id=>patientSources.some(s=>s.id===id))).map(f=>({text:f.text,source_ids:f.source_ids,date:f.source_ids.map(id=>context.sources.find(s=>s.id===id&&s.kind==='session_section')?.date).filter((d):d is string=>Boolean(d)).sort().at(-1)})):[];
 const chief=context.sources.find(s=>s.kind==='patient_context');
 const complaint=text(object(chief?.content).chief_complaint);
 const fallback=recorded.length?recorded:complaint&&chief&&!riskMention.test(complaint)?[{text:complaint,source_ids:[chief.id]}]:[];
 const openContext=context.sources.filter(s=>s.kind==='confirmed_context'&&object(s.content).status==='active').flatMap(s=>{const value=text(object(s.content).current);return value?[{text:value,source_ids:[s.id],date:s.date}]:[]});
 const historyLabels:Record<string,string>={psychiatric_history:'Ψυχιατρικό ιστορικό',medical_history:'Σωματικό ιστορικό',previous_treatments:'Προηγούμενες θεραπείες',hospitalizations:'Νοσηλείες',family_history:'Οικογενειακό ιστορικό',substance_history:'Ουσίες',social_functioning:'Κοινωνική λειτουργικότητα',allergies:'Αλλεργίες'};
 const historySource=context.sources.find(s=>s.kind==='history');
 const history=historySource?Object.entries(historyLabels).flatMap(([key,label])=>{const value=text(object(historySource.content)[key]);return value?[{text:label+': '+value,source_ids:[historySource.id]}]:[]}):[];
 // Durable older notes remain available even when the latest visit is silent.
 for(const f of context.findings.filter(f=>f.key.startsWith('durable:')&&!f.attention)){
  history.push({text:f.text,source_ids:f.source_ids});
 }
 const riskSource=context.sources.find(s=>s.kind==='structured_risk'&&s.session_id===latest?.id);
 const risk=object(riskSource?.content);
 let value:PrevisitBriefing['ideation']['value']=riskSource?({positive:'yes',negative:'no',unknown:'unknown',not_assessed:'not_assessed'} as const)[text(risk.suicidal_ideation) as 'positive'|'negative'|'unknown'|'not_assessed']||'missing':'missing';
 const fields=riskFindings(risk);
 const ideationFields=fields.filter(f=>!f.previousBranch&&['suicidal_ideation','tree:wish','tree:ideation'].includes(f.key));
 const positive=ideationFields.some(f=>['positive','active','passive','both'].includes(f.value));
 if(value==='no'&&positive)value='review';
 else if(positive)value='yes';
 const conflicts=context.findings.filter(f=>f.key.startsWith('risk-review:')&&f.source_ids.some(id=>context.sources.some(s=>s.id===id&&s.session_id===latest?.id)));
 // Narrative/structured disagreement is not silently collapsed into "No".
 if(conflicts.length&&value!=='yes')value='review';
 if(latest&&correctedParents.has(latest.id))value='review';
 const safetyFlags:BriefItem[]=riskSource?fields.filter(f=>!f.previousBranch&&['positive','active','both','passive'].includes(f.value)&&!['suicidal_ideation','tree:wish','tree:ideation'].includes(f.key)).map(f=>({text:f.label+': Ναι',date:riskSource.date,source_ids:refs(riskSource,context)})):[];
 const type=text(object(object(risk.tree).answers).ideation);
 const qualifier=value==='yes'?({passive:'παθητικές σκέψεις',active:'ενεργές σκέψεις',both:'παθητικές και ενεργές σκέψεις'}[type]||undefined):undefined;
 return {diagnoses,differential,medications,narrative:narrative.length?narrative:fallback,narrativeSynthesized:narrative.length>0,context:openContext,history,mse,safetyFlags,mseDate:mseSection?.source.date||null,ideation:{value,date:latest?date(latest.id)||null:null,source_ids:[...new Set([...(riskSource?refs(riskSource,context):[]),...conflicts.flatMap(f=>f.source_ids),...context.layers.corrections.filter(c=>c.session_id===latest?.id).map(c=>c.id)])],qualifier}};
}
