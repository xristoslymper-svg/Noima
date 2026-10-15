'use client';
import {useRef,useState} from 'react';
import type {ContinuityDraft} from '@/lib/clinical/continuity';
import {validContinuity} from '@/lib/clinical/continuity';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import type {useClinicalDraft} from './useClinicalDraft';
type Draft=ReturnType<typeof useClinicalDraft<ContinuityDraft>>;
export default function ClinicalDraftRecovery({draft,reload,sessionId,patientId,disabled=false}:{draft:Draft;reload:()=>Promise<unknown>;sessionId:string;patientId:string;disabled?:boolean}){
 const [confirm,setConfirm]=useState(false),[discard,setDiscard]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const flight=useRef(false);
 async function run(loadServer:boolean){if(flight.current||disabled||draft.saving)return;flight.current=true;setBusy(true);setError('');try{
  if(!loadServer){await draft.flush();return}
  const fresh=await reload() as PatientBundle|null;const session=fresh?.sessions.find(s=>s.id===sessionId&&s.patient_id===fresh.patient.id);
  if(fresh?.patient.id!==patientId||!session||session.patient_id!==patientId||session.status!=='draft'||!validContinuity(session.closure_draft)||!Number.isSafeInteger(session.closure_version)||(session.closure_version as number)<0)throw new Error('Δεν φορτώθηκε έγκυρη πρόχειρη έκδοση. Το κείμενό σας διατηρείται.');
  draft.acceptServerPreservingLocal(session.closure_draft,session.closure_version!);setConfirm(false);
 }catch(cause){setError(cause instanceof Error?cause.message:'Δεν ολοκληρώθηκε η ανάκτηση. Το κείμενό σας διατηρείται.')}finally{flight.current=false;setBusy(false)}}
 // A save temporarily clears its error. Never remove an open consent prompt.
 if(!draft.error&&!draft.olderRecovery&&!error&&!confirm&&!busy)return null;
 const blocked=disabled||busy||draft.saving;
 const labels:Record<string,string>={transcript:'Σημειώσεις',clinical_state_summary:'Κλινική εικόνα',treatment_decision:'Απόφαση / παρεμβάσεις',next_review_focus:'Επανεκτίμηση',adherence:'Λήψη αγωγής',pinned_context:'Σημαντικά θέματα'};
 const backup=draft.olderRecovery?Object.entries(labels).map(([key,label])=>label+'\n'+String(draft.olderRecovery?.[key as keyof ContinuityDraft]||'')).join('\n\n'):'';
 return <section className="save-state" aria-label="Ανάκτηση προχείρου" onPointerDown={event=>{
  // Keep the failed field focused until the explicit recovery action runs.
  // Otherwise its blur handler retries a save and removes the clicked control
  // between pointer-down and click. Keyboard activation remains unchanged.
  if((event.target as HTMLElement).closest('button'))event.preventDefault();
 }}>
  {draft.error&&<><p role="alert">{draft.error}</p><div>
   {!draft.hasConflict&&<button type="button" disabled={blocked} onClick={()=>void run(false)}>Επανάληψη αποθήκευσης</button>}
   <button type="button" disabled={blocked} onClick={()=>setConfirm(true)}>Φόρτωση αποθηκευμένου προχείρου…</button>
  </div></>}
  {confirm&&<div role="group" aria-label="Επιβεβαίωση φόρτωσης προχείρου"><p>Θα αντικατασταθεί το κείμενο στην οθόνη με την αποθηκευμένη έκδοση. Οι τοπικές αλλαγές θα κρατηθούν ως αντίγραφο σε αυτή την καρτέλα του browser, έως 24 ώρες. Δεν θα γίνει αυτόματη συγχώνευση.</p><button type="button" disabled={blocked} onClick={()=>void run(true)}>Διατήρηση αντιγράφου και φόρτωση</button><button type="button" disabled={blocked} onClick={()=>setConfirm(false)}>Ακύρωση φόρτωσης</button></div>}
  {draft.olderRecovery&&<details><summary>Αντίγραφο μη αποθηκευμένων αλλαγών</summary><p>Αντιγράψτε όσα χρειάζονται πριν κλείσετε αυτή την καρτέλα.</p><textarea aria-label="Αντίγραφο μη αποθηκευμένων αλλαγών" rows={8} readOnly value={backup}/>{discard?<><p>Να διαγραφεί το αντίγραφο; Η αποθηκευμένη καταγραφή δεν αλλάζει.</p><button type="button" disabled={blocked} onClick={()=>{draft.dismissOlderRecovery();setDiscard(false)}}>Διαγραφή αντιγράφου</button><button type="button" onClick={()=>setDiscard(false)}>Διατήρηση αντιγράφου</button></>:<button type="button" disabled={blocked} onClick={()=>setDiscard(true)}>Απόρριψη αντιγράφου…</button>}</details>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
