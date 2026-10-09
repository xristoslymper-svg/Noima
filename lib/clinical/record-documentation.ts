import type {PatientBundle,DemoSession} from '../patients/demo-runtime';
import {effectiveText,effectiveDocument,correctionsFor} from './corrections.ts';

/** Completed encounter documentation, never approval of persistent context. */
export function recordDocumentation(bundle:PatientBundle,visit:DemoSession|undefined){
 if(!visit||visit.status!=='completed')return null;
 if(visit.continuity?.approved_at)return {
  clinicalState:visit.continuity.clinical_state_summary,
  reviewFocus:visit.continuity.next_review_focus,
  treatment:visit.continuity.treatment_decision,
  source:'continuity' as const,date:visit.continuity.approved_at,sessionId:visit.id,
 };
 if(visit.session_type!=='initial_assessment')return null;
 const section=(key:string)=>(bundle.sections||[]).find(s=>s.session_id===visit.id&&s.section_key===key);
 const text=(key:string)=>effectiveText(section(key),bundle.corrections,visit.id,key).trim();
 let assessment=effectiveDocument(section('assessment'),bundle.corrections,visit.id,'assessment');
 for(const correction of correctionsFor(bundle.corrections,visit.id)){
  const after=correction.patch?.assessment?.after;
  if(typeof after==='string')assessment=null;
  else if(after&&typeof after==='object'&&'kind' in after&&after.kind==='assessment')assessment=after as NonNullable<typeof assessment>;
 }
 // Retain certainty and reference dates; never make old findings today's facts.
 const impression=assessment?.fields.filter(f=>f.text.trim()||f.codes?.length).map(f=>[
  f.key==='impression'?'Κλινική αποτίμηση':f.label,
  f.status?({provisional:'Προσωρινή',under_investigation:'Υπό διερεύνηση',confirmed:'Επιβεβαιωμένη'}[f.status]):'',
  f.reference?`Αναφορά προηγούμενης καταγραφής ${f.reference.date}`:'',
 ].filter(Boolean).join(' · ')+': '+[f.text,(f.codes||[]).map(c=>c.code+' · '+c.label).join('; ')].filter(Boolean).join(' · ')).join('\n')||text('assessment');
 return {clinicalState:impression,reviewFocus:text('review'),treatment:text('plan'),source:'initial' as const,date:visit.completed_at||visit.started_at,sessionId:visit.id};
}
