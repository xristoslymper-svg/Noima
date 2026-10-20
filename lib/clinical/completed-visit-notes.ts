import {isCustomSection} from './visit-layout.ts';
import type {PatientBundle,DemoSession} from '../patients/demo-runtime';
import {correctionsFor,effectiveText} from './corrections.ts';

// A read projection of clinician-authored, completed notes, never a generated
// summary or a copy of an unfinished encounter. Empty corrections stay empty.
export function completedVisitNotes(bundle:PatientBundle,session?:DemoSession){
 if(!session||session.status!=='completed')return null;
 const sections=bundle.sections.filter(section=>section.session_id===session.id);
 const corrections=correctionsFor(bundle.corrections,session.id);
 const memory=session.continuity?.approved_at?session.continuity:null;
 const read=(key:string,fallback='')=>{
  const section=sections.find(item=>item.section_key===key);
  const corrected=corrections.some(item=>Object.prototype.hasOwnProperty.call(item.patch?.[key]||{},'after'));
  return section||corrected?effectiveText(section,bundle.corrections,session.id,key):fallback;
 };
 return {
  clinical:read('interview',memory?.clinical_state_summary)||sections.filter(s=>isCustomSection(s.section_key)).map(s=>s.content).join('\n\n'),
  plan:read('plan',memory?.treatment_decision),
  review:read('review',memory?.next_review_focus),
  adherence:read('adherence',memory?.adherence),
  effects:read('effects'),functioning:read('functioning'),
  sessionId:session.id,date:session.started_at,
  corrected:corrections.length>0,
 };
}
