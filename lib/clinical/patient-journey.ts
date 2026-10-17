import type {PatientBundle,DemoSession} from '../patients/demo-runtime';
import {completedVisitNotes} from './completed-visit-notes.ts';
import {sessionClinicalTime} from './visit-workspace-state.ts';

export function previousJourneyVisit(bundle:PatientBundle,current?:DemoSession){
 const limit=current?Date.parse(sessionClinicalTime(bundle,current)):Infinity;
 return bundle.sessions.filter(s=>s.status==='completed'&&s.id!==current?.id&&Date.parse(sessionClinicalTime(bundle,s))<limit)
 .sort((a,b)=>Date.parse(sessionClinicalTime(bundle,b))-Date.parse(sessionClinicalTime(bundle,a))||a.id.localeCompare(b.id))[0];
}
export function journeyExcerpt(value:string,limit=280){const text=value.trim();return text.length>limit?text.slice(0,limit).trimEnd()+'…':text;}
export function journeyReview(bundle:PatientBundle,session:DemoSession){
 const sections=bundle.sections.filter(s=>s.session_id===session.id);
 const memory=session.closure_draft;
 const read=(key:string)=>sections.find(s=>s.section_key===key)?.content||'';
 const followup=session.session_type==='follow_up';
 return {
 clinical:followup?memory?.clinical_state_summary||read('interview'):read('interview'),
 plan:followup?memory?.treatment_decision||read('plan'):read('plan'),
 review:followup?memory?.next_review_focus||read('review'):read('review'),
 medicationWrites:bundle.medicationEvents.filter(e=>e.session_id===session.id&&!(bundle.medicationRevisions||[]).some(r=>r.event_id===e.id)).length,
 sideEffects:bundle.medicationSideEffects.filter(e=>e.session_id===session.id).length,
 };
}
export function latestJourneyNotes(bundle:PatientBundle,current?:DemoSession){const visit=previousJourneyVisit(bundle,current);return {visit,notes:completedVisitNotes(bundle,visit)};}
