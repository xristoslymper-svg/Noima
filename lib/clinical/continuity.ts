export type ContinuityDraft = {
 transcript:string; clinical_state_summary:string; treatment_decision:string;
 next_review_focus:string; pinned_context:string; adherence:string;
 source:'manual'|'ai_assisted';
};
export type VisitContinuity = ContinuityDraft & {session_id:string; approved_at:string; approved_by:string};
export const emptyContinuity:ContinuityDraft={transcript:'',clinical_state_summary:'',treatment_decision:'',next_review_focus:'',pinned_context:'',adherence:'',source:'manual'};
export function validContinuity(value:unknown):value is ContinuityDraft {
 if(!value||typeof value!=='object')return false;
 const v=value as Record<string,unknown>;
 return Object.keys(emptyContinuity).every(k=>typeof v[k]==='string'&&(v[k] as string).length<=20000)&&(v.source==='manual'||v.source==='ai_assisted');
}
export function mergeContinuityProposal(current:ContinuityDraft,proposal:ContinuityDraft):ContinuityDraft{
 const result={...current,source:'ai_assisted' as const};
 for(const key of ['clinical_state_summary','treatment_decision','next_review_focus','pinned_context','adherence'] as const){
  if(proposal[key].trim())result[key]=proposal[key];
 }
 return result;
}
