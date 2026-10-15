import {validContinuity} from './continuity.ts';
import {followupFieldConflicts} from './followup-fields.ts';
import {finalizationBlocker,mseTimeline} from './visit-workspace-state.ts';
import type {PatientBundle} from '../patients/demo-runtime';
export class FollowupFinalizationError extends Error{
 readonly anchor:string;readonly field?:string;
 constructor(message:string,anchor:string,field?:string){super(message);this.anchor=anchor;this.field=field}
}
export function focusFollowupBlocker(cause:unknown,sessionId:string){
 if(!(cause instanceof FollowupFinalizationError))return;
 requestAnimationFrame(()=>{
  const field=cause.field?document.getElementById(sessionId+'-closure-'+cause.field):null;
  const section=document.querySelector<HTMLElement>(`[data-visit-part="${cause.anchor}"], [data-mobile-section="${cause.anchor}"], .visit-source-conflicts`);
  const target=field||section?.querySelector<HTMLElement>('textarea, input, button, select')||section;
  if(target){for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;target.scrollIntoView({block:'center'});target.focus({preventScroll:true})}
 });
}
/** Shared by compact and detailed editors; only saved canonical data is checked. */
export function followupFinalizationVersion(bundle:PatientBundle,sessionId:string):number{
 const session=bundle.sessions.find(s=>s.id===sessionId&&s.patient_id===bundle.patient.id);
 if(!session||session.status!=='draft'||session.session_type!=='follow_up')throw new Error('Δεν επιβεβαιώθηκε η συγκεκριμένη πρόχειρη επανεξέταση.');
 const value=session.closure_draft;
 if(!validContinuity(value))throw new Error('Αποθηκεύστε την κλινική καταγραφή πριν οριστικοποιήσετε.');
 const required=[['clinical_state_summary','Κλινική εικόνα'],['treatment_decision','Απόφαση / παρεμβάσεις'],['next_review_focus','Τι θα επανεκτιμηθεί'],['adherence','Λήψη αγωγής']] as const;
 const missing=required.find(([key])=>!value[key].trim());
 if(missing)throw new FollowupFinalizationError('Χρειάζεται καταγραφή: '+missing[1]+'.','clinical',missing[0]);
 if(followupFieldConflicts(value,sessionId,bundle.sections).length)throw new FollowupFinalizationError('Υπάρχουν διαφορετικές παλαιότερες αναλυτικές σημειώσεις. Επιλέξτε ποια θα διατηρηθεί στην ενότητα συμφωνίας καταγραφών.','consistency');
 const sections=bundle.sections.filter(s=>s.session_id===sessionId);
 const projected={interview:value.clinical_state_summary,assessment:value.clinical_state_summary,plan:value.treatment_decision,review:value.next_review_focus};
 const timeline=mseTimeline(bundle,sessionId,session.started_at);
 const blocker=finalizationBlocker([...sections,...Object.entries(projected).filter(([key])=>!sections.some(s=>s.section_key===key&&s.content.trim())).map(([section_key,content])=>({section_key,content}))],bundle.risks.find(r=>r.session_id===sessionId),{kind:'mse',fields:Object.values(timeline.references).map(r=>r.field)});
 if(blocker)throw new FollowupFinalizationError(blocker.message,blocker.anchor);
 if(!Number.isSafeInteger(session.closure_version)||(session.closure_version as number)<0)throw new Error('Δεν επιβεβαιώθηκε η έκδοση της καταγραφής. Ανανεώστε πριν συνεχίσετε.');
 return session.closure_version as number;
}
