'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useTranslations} from 'next-intl';
import {createContext,useContext,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import {medicationSessionId} from '@/lib/clinical/treatment-plan';
import {formatClinicDateTime} from '@/lib/clinic-time';
type Post=typeof demoPost;
type Pending={body:Record<string,unknown>;resolve:(result:Awaited<ReturnType<Post>>)=>void;reject:(reason:Error)=>void};
const SaveContext=createContext<Post|null>(null);
export function useMedicationPost():Post{return useContext(SaveContext)||demoPost}
/** Attribution is decided only for this write; it never becomes a hidden page mode. */
export default function MedicationSaveScope({bundle,children}:{bundle:PatientBundle;children:ReactNode}){
 const ui=useUiText();

 const t=useTranslations();

 const current=useRef(bundle);current.current=bundle;
 const flight=useRef<Pending|null>(null),posting=useRef(false),returnFocus=useRef<HTMLElement|null>(null);
 const [pending,setPending]=useState<Pending|null>(null),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false);
 const selectRef=useRef<HTMLSelectElement>(null),title=useId();
 const drafts=bundle.sessions.filter(s=>s.patient_id===bundle.patient.id&&s.status==='draft');
 useEffect(()=>{if(pending)selectRef.current?.focus()},[pending]);
 useEffect(()=>()=>{flight.current?.reject(new Error(''));flight.current=null},[]);
 function finish(){flight.current=null;setPending(null);setSelected('');posting.current=false;setBusy(false);requestAnimationFrame(()=>{if(returnFocus.current?.isConnected)returnFocus.current.focus()})}
 function cancel(){if(posting.current)return;flight.current?.reject(new Error(''));finish()}
 const post:Post=async body=>{
  if(body.session_id){medicationSessionId(current.current,String(body.session_id));return demoPost(body)}
  if(!current.current.sessions.some(s=>s.patient_id===current.current.patient.id&&s.status==='draft'))return demoPost({...body,session_id:null});
  if(flight.current)throw new Error('Ολοκληρώστε πρώτα την ανοιχτή αποθήκευση.');
  returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  return new Promise((resolve,reject)=>{const request={body:{...body},resolve,reject};flight.current=request;setPending(request);setSelected('')});
 };
 async function confirm(){
  const request=flight.current;if(!request||posting.current)return;
  posting.current=true;setBusy(true);
  try{const session=medicationSessionId(current.current,selected);const result=await demoPost({...request.body,session_id:session});request.resolve(result)}
  catch(error){request.reject(error instanceof Error?error:new Error('Δεν αποθηκεύτηκε η αλλαγή.'))}
  finally{finish()}
 }
 const medication=pending&&(pending.body.name||bundle.medications.find(m=>m.id===pending.body.medication_id)?.medication_name);
 return <SaveContext.Provider value={post}>{children}{pending&&<div className="entry-modal-backdrop" onClick={cancel}><section role="dialog" aria-modal="true" aria-labelledby={title} className="entry-modal medication-runtime-modal" onClick={event=>event.stopPropagation()} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel()}
  if(event.key==='Tab'){const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)'));if(!controls.length){event.preventDefault();return}const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
 }}>
  <span className="kicker">{t('current.m114')}</span><h2 id={title}>{t('current.m115')}</h2>
  {medication&&<p>{String(medication)}</p>}
  <p>{t('current.m116')}</p>
  <label>{t('current.m117')}<select ref={selectRef} aria-label={t('current.m121')} disabled={busy} value={selected} onChange={event=>setSelected(event.target.value)}><option value="">{t('current.m118')}</option>{drafts.map(s=><option key={s.id} value={s.id}>Μη ολοκληρωμένη · {formatClinicDateTime(s.started_at)} · {s.session_type==='initial_assessment'?ui('Αρχική αξιολόγηση'):ui('Επανεξέταση')}</option>)}</select></label>
  <p className="visit-hint">{t('current.m119')}</p>
  <div className="entry-footer"><button type="button" disabled={busy} onClick={cancel}>{t('current.m120')}</button><button type="button" className="entry-primary" disabled={busy} onClick={()=>void confirm()}>{busy?'Αποθήκευση…':'Αποθήκευση αλλαγής'}</button></div>
 </section></div>}</SaveContext.Provider>;
}
