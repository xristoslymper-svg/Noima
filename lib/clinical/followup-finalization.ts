import {validContinuity} from './continuity.ts';
import {followupFieldConflicts} from './followup-fields.ts';
import {finalizationBlocker,mseTimeline} from './visit-workspace-state.ts';
import type {PatientBundle} from '../patients/demo-runtime';
/** Shared by compact and detailed editors; only saved canonical data is checked. */
export function followupFinalizationVersion(bundle:PatientBundle,sessionId:string):number{
 const session=bundle.sessions.find(s=>s.id===sessionId&&s.patient_id===bundle.patient.id);
 if(!session||session.status!=='draft'||session.session_type!=='follow_up')throw new Error('Δεν επιβεβαιώθηκε η συγκεκριμένη πρόχειρη επανεξέταση.');
 const value=session.closure_draft;
 if(!validContinuity(value))throw new Error('Αποθηκεύστε την κλινική καταγραφή πριν οριστικοποιήσετε.');
 const required=[['clinical_state_summary','Κλινική εικόνα'],['treatment_decision','Απόφαση / παρεμβάσεις'],['next_review_focus','Τι θα επανεκτιμηθεί'],['adherence','Λήψη αγωγής']] as const;
 const missing=required.find(([key])=>!value[key].trim());
 if(missing)throw new Error('Χρειάζεται καταγραφή: '+missing[1]+'.');
 if(followupFieldConflicts(value,sessionId,bundle.sections).length)throw new Error('Υπάρχουν διαφορετικές παλαιότερες αναλυτικές σημειώσεις. Ανοίξτε τη σύντομη καταγραφή και επιλέξτε ποια θα διατηρηθεί.');
 const sections=bundle.sections.filter(s=>s.session_id===sessionId);
 const projected={interview:value.clinical_state_summary,assessment:value.clinical_state_summary,plan:value.treatment_decision,review:value.next_review_focus};
 const timeline=mseTimeline(bundle,sessionId,session.started_at);
 const blocker=finalizationBlocker([...sections,...Object.entries(projected).filter(([key])=>!sections.some(s=>s.section_key===key&&s.content.trim())).map(([section_key,content])=>({section_key,content}))],bundle.risks.find(r=>r.session_id===sessionId),{kind:'mse',fields:Object.values(timeline.references).map(r=>r.field)});
 if(blocker)throw new Error(blocker.message);
 if(!Number.isSafeInteger(session.closure_version)||(session.closure_version as number)<0)throw new Error('Δεν επιβεβαιώθηκε η έκδοση της καταγραφής. Ανανεώστε πριν συνεχίσετε.');
 return session.closure_version as number;
}
