import {emptyContinuity,type ContinuityDraft} from './continuity.ts';
import type {DemoSection,DemoSession} from '../patients/demo-runtime';

export const followupFields={interview:'clinical_state_summary',plan:'treatment_decision',review:'next_review_focus',adherence:'adherence'} as const;
export function initialFollowupDraft(session:DemoSession,sections:DemoSection[]):ContinuityDraft{
 if(session.closure_draft)return session.closure_draft;
 const value={...emptyContinuity};
 for(const [key,field] of Object.entries(followupFields))value[field]=sections.find(s=>s.session_id===session.id&&s.section_key===key)?.content||'';
 return value;
}
export function followupFieldConflicts(value:ContinuityDraft,sessionId:string,sections:DemoSection[]){
 return Object.entries(followupFields).flatMap(([key,field])=>{
  const section=sections.find(s=>s.session_id===sessionId&&s.section_key===key);
  return section?.content.trim()&&section.content!==value[field]?[{key,field,section,current:value[field]}]:[];
 });
}
