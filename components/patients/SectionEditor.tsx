'use client';
import {useEffect,useRef,useState} from 'react';
import ClinicalTextField,{type WritingCommit} from '@/components/dictation/ClinicalTextField';
import {narrativeWritingRecovery,type WritingPending} from '@/lib/clinical/clinical-writing';
import {useClinicalDraft} from './useClinicalDraft';
import type {ClinicalProposal} from '@/lib/clinical/core-types';
import type {DemoSection,PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import {formatClinicDateTime} from '@/lib/clinic-time';
const required=new Set(['interview','mse','assessment','plan','review']);
const fmt=(value?:string|null)=>value?formatClinicDateTime(value):'—';
export default function SectionEditor({sessionId,definition,existing,proposals,onSaved,registerFlusher,onDirtyChange}:{sessionId:string;definition:{key:string;title:string};existing?:DemoSection;proposals:ClinicalProposal[];onSaved:()=>Promise<unknown>;registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void}){
 const key='section:'+definition.key;const [conflict,setConflict]=useState<DemoSection|null|undefined>(),[recoverable,setRecoverable]=useState(''),[recovery,setRecovery]=useState<WritingPending|null>(null),[pending,setPending]=useState(false);
 const draft=useClinicalDraft({storageKey:sessionId+':'+key,initial:existing?.content||'',version:existing?.version??null,write:async(content,version)=>{const d=await demoPost({action:'save_section',session_id:sessionId,section_key:definition.key,content,source:'manual',expected_version:version});return {value:d.section.content as string,version:d.section.version as number}},onSaved,onDirty:dirty=>onDirtyChange(key,dirty)});
 const current=useRef(draft);current.current=draft;
 useEffect(()=>registerFlusher(key,draft.flush),[key,registerFlusher,draft.flush]);
 useEffect(()=>{try{setRecoverable(sessionStorage.getItem(sessionId+':transcript:'+definition.key)||'')}catch{}},[sessionId,definition.key]);
 async function confirm(text:string,{pending,rememberProposal}:WritingCommit){
  await current.current.flush();const latest=current.current;
  if(latest.currentValue()!==pending.base)throw new Error('Η αρχική καταγραφή άλλαξε. Ελέγξτε τη νεότερη έκδοση.');
  let id=pending.proposalId;
  if(!id){const r=await fetch('/api/clinical/writing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,section:definition.key,kind:pending.kind,original:pending.base,transcript:pending.transcript,text,model:pending.model})});const result=await r.json();if(!r.ok)throw new Error(result.error||'Δεν καταχωρίστηκε η πρόταση.');id=result.entry?.id;if(!id)throw new Error('Δεν καταχωρίστηκε η πρόταση.');rememberProposal(id)}
  const result=await demoPost({action:'approve_proposal',proposal_id:id,text,mode:'replace',expected_version:latest.version()});
  latest.acceptServer(result.section.content,result.section.version);setRecoverable('');setRecovery(null);
  try{sessionStorage.removeItem(sessionId+':transcript:'+definition.key);sessionStorage.removeItem(`noima-proposal:${sessionId}:${definition.key}`)}catch{}
  await onSaved().catch(()=>{});
 }
 function recover(proposal?:ClinicalProposal){
  // Legacy proposals are rendered inline; recovering one never launches AI.
  let legacy;
  if(!proposal){try{const old=JSON.parse(sessionStorage.getItem(`noima-proposal:${sessionId}:${definition.key}`)||'null');if(old&&typeof old.text==='string')legacy={text:old.text,manual:Boolean(old.manual),mode:old.mode||'append'}}catch{}}
  setRecovery(narrativeWritingRecovery(current.current.currentValue(),proposal,recoverable,legacy));
 }
 async function compare(){const fresh=await onSaved() as PatientBundle|null;if(fresh)setConflict(fresh.sections.find(s=>s.session_id===sessionId&&s.section_key===definition.key)||null)}
 return <div className="clinical-section">
  <ClinicalTextField sessionId={sessionId} section={definition.key} fieldKey="narrative" title={definition.title+(required.has(definition.key)?' *':'')} rows={4} className="section-editor" fullMicLabel={definition.key==='interview'} value={draft.value} onChange={draft.change} onBlur={()=>void draft.flush().catch(()=>{})} onConfirm={confirm} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onPendingChange={setPending} recovery={recovery} onRecoveryConsumed={()=>setRecovery(null)}/>
  <div role="status">{draft.saving?'Αποθήκευση στο πρόχειρο…':draft.error||(draft.savedAt?'Το πρόχειρο αποθηκεύτηκε '+draft.savedAt:existing?'Το πρόχειρο αποθηκεύτηκε':'Δεν έχει καταγραφεί')}</div>
  {draft.error&&<><button onClick={()=>void draft.flush().catch(()=>{})}>Επανάληψη</button><button onClick={()=>void compare()}>Σύγκριση με αποθηκευμένο</button></>}
  {conflict!==undefined&&<div className="conflict-review"><h4>Αποθηκευμένη έκδοση</h4><p>{conflict?.content||'Κενή ενότητα'}</p><p>Το δικό σας κείμενο παραμένει στον επεξεργαστή.</p><button disabled={pending} onClick={()=>{draft.acceptServer(conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>Χρήση αποθηκευμένου</button><button disabled={pending} onClick={()=>{draft.resolve(draft.value,conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>Ρητή αντικατάσταση με το δικό μου</button><button disabled={pending} onClick={()=>{draft.resolve([conflict?.content,draft.value].filter(Boolean).join('\n\n'),conflict?.content||'',conflict?.version??null);setConflict(undefined)}}>Συνένωση των δύο</button></div>}
  {!pending&&<>{proposals.filter(p=>p.status==='proposal').slice(0,3).map(p=><button type="button" key={p.id} onClick={()=>recover(p)}>Συνέχεια ελέγχου πρότασης · {fmt(p.created_at)}</button>)}{recoverable&&<button type="button" className="text-button" onClick={()=>recover()}>Ανάκτηση τελευταίας μεταγραφής</button>}</>}
  {proposals.some(p=>p.status==='approved')&&<details className="clinical-provenance"><summary aria-label="Προέλευση επιβεβαιωμένου κειμένου" title="Προέλευση επιβεβαιωμένου κειμένου"><span aria-hidden="true">⌄</span></summary>{proposals.filter(p=>p.status==='approved').map(p=><div key={p.id}><small>Εγκρίθηκε {fmt(p.approved_at)}</small><p>Μεταγραφή: {p.transcript}</p><p>Εγκεκριμένο: {p.approved_text}</p></div>)}</details>}
 </div>;
}
