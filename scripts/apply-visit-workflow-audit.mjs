// One-shot maintenance script. Exact-match patches fail closed on source drift.
// Runs only on fix/visit-workflow-audit-20261015; removed from the final change.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
function put(path,content){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,content.trimStart());}
function patch(path,before,after){const text=readFileSync(path,'utf8');if(!text.includes(before)){if(text.includes(after))return;throw new Error('Source drift: '+path+' '+before.slice(0,100));}if(text.split(before).length!==2)throw new Error('Ambiguous patch: '+path+' '+before.slice(0,80));writeFileSync(path,text.replace(before,after));}

put('lib/calendar/upcoming.ts',`
export type UpcomingContext={excludeAppointmentId?:string|null;excludeSessionId?:string|null};
type Appointment={id:string;session_id?:string|null;status:string;scheduled_start:string};
/** A next appointment starts now or later and is never the active visit. */
export function selectUpcomingAppointments<T extends Appointment>(appointments:T[],now:number,context:UpcomingContext={}):T[]{
 if(!Number.isFinite(now))return [];
 return appointments.filter(a=>a.status==='scheduled'&&a.id!==context.excludeAppointmentId&&(!context.excludeSessionId||a.session_id!==context.excludeSessionId)&&Date.parse(a.scheduled_start)>=now)
  .sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start)||a.id.localeCompare(b.id));
}
`);
patch('lib/clinical/patient-record.ts',"import {riskFindings}","import {selectUpcomingAppointments,type UpcomingContext} from '../calendar/upcoming.ts';\nimport {riskFindings}");
patch('lib/clinical/patient-record.ts',"export function upcomingAppointments(bundle:Pick<PatientBundle,'appointments'>,now=new Date()){\n return bundle.appointments.filter(a=>a.status==='scheduled'&&Date.parse(a.scheduled_end)>=now.getTime()).sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start));\n}","export function upcomingAppointments(bundle:Pick<PatientBundle,'appointments'>,now=new Date(),context:UpcomingContext={}){\n return selectUpcomingAppointments(bundle.appointments,now.getTime(),context);\n}");
patch('lib/clinical/patient-record.ts','export function patientRecord(bundle:PatientBundle,now=new Date()){','export function patientRecord(bundle:PatientBundle,now=new Date(),context:UpcomingContext={}){');
patch('lib/clinical/patient-record.ts','const nextAppointment=upcomingAppointments(bundle,now)[0]||null;','const nextAppointment=upcomingAppointments(bundle,now,context)[0]||null;');
patch('lib/calendar/appointment-context.ts','export type CalendarPosition = {',"import {selectUpcomingAppointments} from './upcoming.ts';\nexport type CalendarPosition = {");
patch('lib/calendar/appointment-context.ts',"return events.filter(e => e.patient_id === patientId && e.id !== excludedId && e.status === 'scheduled' && Date.parse(e.scheduled_start) >= now)\n    .sort((a, b) => Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start));","return selectUpcomingAppointments(events.filter(e=>e.patient_id===patientId),now,{excludeAppointmentId:excludedId});");
patch('components/patients/VisitNextAppointment.tsx','showHeading=true}:{bundle:PatientBundle;','showHeading=true,sessionId}:{sessionId?:string;bundle:PatientBundle;');
patch('components/patients/VisitNextAppointment.tsx','const appointments=upcomingAppointments(bundle),next=appointments[0];','const appointments=upcomingAppointments(bundle,new Date(),{excludeSessionId:sessionId}),next=appointments[0];');
patch('components/patients/PatientSession.tsx','<VisitNextAppointment bundle={bundle} reload={reloadContext}', '<VisitNextAppointment bundle={bundle} sessionId={draft.id} reload={reloadContext}');
patch('components/patients/FollowupClosure.tsx','<VisitNextAppointment bundle={bundle} reload={p.reloadContext}', '<VisitNextAppointment bundle={bundle} sessionId={session.id} reload={p.reloadContext}');
patch('components/patients/PatientWorkspace.tsx','const record=patientRecord(bundle);','const record=patientRecord(bundle,new Date(),{excludeSessionId:visitId});');

put('lib/clinical/followup-finalization.ts',`
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
`);
patch('components/patients/PatientSession.tsx',"import FollowupClosure from './FollowupClosure';","import FollowupClosure from './FollowupClosure';\nimport {followupFinalizationVersion} from '@/lib/clinical/followup-finalization';\nimport VisitAdministration from './VisitAdministration';");
patch('components/patients/PatientSession.tsx',"if(draft?.session_type==='follow_up'){setDetailed(false);return}","if(draft?.session_type==='follow_up'){await onFinalize(draft.id,true,followupFinalizationVersion(fresh,draft.id));return}");
patch('components/patients/PatientSession.tsx',"  }catch{\n   // The concrete save/finalize error is already rendered in the workspace.\n  }finally{finishing.current=false}","  }catch(cause){\n   setFlushError(cause instanceof Error?cause.message:'Δεν επιβεβαιώθηκε η οριστικοποίηση.');\n  }finally{finishing.current=false}");
patch('components/patients/FollowupClosure.tsx',"import {emptyContinuity,type ContinuityDraft} from '@/lib/clinical/continuity';","import type {ContinuityDraft} from '@/lib/clinical/continuity';\nimport {followupFinalizationVersion} from '@/lib/clinical/followup-finalization';\nimport ClinicalDraftRecovery from './ClinicalDraftRecovery';");
patch('components/patients/FollowupClosure.tsx',"import {mseTimeline,previousMseReference,finalizationBlocker}","import {mseTimeline,previousMseReference}");
{
 const path='components/patients/FollowupClosure.tsx';const text=readFileSync(path,'utf8');const start=text.indexOf(' async function finalize(){'),end=text.indexOf('\n const risk=',start);if(start<0||end<0)throw new Error('Missing finalize boundary');
 const replacement=" async function finalize(){if(flight.current)return;flight.current=true;setBusy(true);setError('');try{const fresh=await p.flushAll(true) as PatientBundle;checkConsistency(fresh);await p.onFinalize(followupFinalizationVersion(fresh,session.id))}catch(e){setError(e instanceof Error?e.message:'Δεν ολοκληρώθηκε η επίσκεψη.')}finally{flight.current=false;setBusy(false)}}";
 writeFileSync(path,text.slice(0,start)+replacement+text.slice(end));
}
patch('components/patients/FollowupClosure.tsx',"'Ολοκλήρωση καταγραφής'","'Οριστικοποίηση καταγραφής'");

// Recovery is never destructive: preserve the latest text before accepting server state.
patch('components/patients/useClinicalDraft.ts',' function resolve(next:T,server:T,serverVersion:number|null){',` function acceptServerPreservingLocal(next:T,nextVersion:number|null){
  if(flight.current)throw new Error('Περιμένετε να ολοκληρωθεί η αποθήκευση.');
  if(JSON.stringify(latest.current)!==JSON.stringify(next)){
   const existing=readRecovery(sessionStorage,backupKey);
   if(existing&&JSON.stringify(JSON.parse(existing).value)!==JSON.stringify(latest.current))throw new Error('Υπάρχει ήδη αντίγραφο προηγούμενων αλλαγών. Κρατήστε το πριν το αντικαταστήσετε.');
   // If storage is unavailable, fail before replacing any local text.
   writeRecovery(sessionStorage,backupKey,JSON.stringify({value:latest.current,version:v.current}));
   setOlderRecovery(latest.current);
  }
  acceptServer(next,nextVersion);
 }
 function resolve(next:T,server:T,serverVersion:number|null){`);
patch('components/patients/useClinicalDraft.ts','savedAt,acceptServer,resolve,','savedAt,acceptServer,acceptServerPreservingLocal,resolve,');
put('components/patients/ClinicalDraftRecovery.tsx',`
'use client';
import {useRef,useState} from 'react';
import type {ContinuityDraft} from '@/lib/clinical/continuity';
import {validContinuity} from '@/lib/clinical/continuity';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import type {useClinicalDraft} from './useClinicalDraft';
type Draft=ReturnType<typeof useClinicalDraft<ContinuityDraft>>;
export default function ClinicalDraftRecovery({draft,reload,sessionId,disabled=false}:{draft:Draft;reload:()=>Promise<unknown>;sessionId:string;disabled?:boolean}){
 const [confirm,setConfirm]=useState(false),[discard,setDiscard]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const flight=useRef(false);
 async function run(loadServer:boolean){if(flight.current||disabled||draft.saving)return;flight.current=true;setBusy(true);setError('');try{
  if(!loadServer){await draft.flush();return}
  const fresh=await reload() as PatientBundle|null;const session=fresh?.sessions.find(s=>s.id===sessionId&&s.patient_id===fresh.patient.id);
  if(!session||session.status!=='draft'||!validContinuity(session.closure_draft)||!Number.isSafeInteger(session.closure_version))throw new Error('Δεν φορτώθηκε έγκυρη πρόχειρη έκδοση. Το κείμενό σας διατηρείται.');
  draft.acceptServerPreservingLocal(session.closure_draft,session.closure_version!);setConfirm(false);
 }catch(cause){setError(cause instanceof Error?cause.message:'Δεν ολοκληρώθηκε η ανάκτηση. Το κείμενό σας διατηρείται.')}finally{flight.current=false;setBusy(false)}}
 if(!draft.error&&!draft.olderRecovery&&!error)return null;
 const blocked=disabled||busy||draft.saving;
 const labels:Record<string,string>={transcript:'Σημειώσεις',clinical_state_summary:'Κλινική εικόνα',treatment_decision:'Απόφαση / παρεμβάσεις',next_review_focus:'Επανεκτίμηση',adherence:'Λήψη αγωγής',pinned_context:'Σημαντικά θέματα'};
 const backup=draft.olderRecovery?Object.entries(labels).map(([key,label])=>label+'\n'+String(draft.olderRecovery?.[key as keyof ContinuityDraft]||'')).join('\n\n'):'';
 return <section className="save-state" aria-label="Ανάκτηση προχείρου">
  {draft.error&&<><p role="alert">{draft.error}</p><div>
   {!draft.hasConflict&&<button type="button" disabled={blocked} onClick={()=>void run(false)}>Επανάληψη αποθήκευσης</button>}
   <button type="button" disabled={blocked} onClick={()=>setConfirm(true)}>Φόρτωση αποθηκευμένου προχείρου…</button>
  </div></>}
  {confirm&&<div role="group" aria-label="Επιβεβαίωση φόρτωσης προχείρου"><p>Θα αντικατασταθεί το κείμενο στην οθόνη με την αποθηκευμένη έκδοση. Οι τοπικές αλλαγές θα κρατηθούν ως αντίγραφο σε αυτή την καρτέλα του browser, έως 24 ώρες. Δεν θα γίνει αυτόματη συγχώνευση.</p><button type="button" disabled={blocked} onClick={()=>void run(true)}>Διατήρηση αντιγράφου και φόρτωση</button><button type="button" disabled={blocked} onClick={()=>setConfirm(false)}>Ακύρωση φόρτωσης</button></div>}
  {draft.olderRecovery&&<details><summary>Αντίγραφο μη αποθηκευμένων αλλαγών</summary><p>Αντιγράψτε όσα χρειάζονται πριν κλείσετε αυτή την καρτέλα.</p><textarea aria-label="Αντίγραφο μη αποθηκευμένων αλλαγών" rows={8} readOnly value={backup}/>{discard?<><p>Να διαγραφεί το αντίγραφο; Η αποθηκευμένη καταγραφή δεν αλλάζει.</p><button type="button" disabled={blocked} onClick={()=>{draft.dismissOlderRecovery();setDiscard(false)}}>Διαγραφή αντιγράφου</button><button type="button" onClick={()=>setDiscard(false)}>Διατήρηση αντιγράφου</button></>:<button type="button" disabled={blocked} onClick={()=>setDiscard(true)}>Απόρριψη αντιγράφου…</button>}</details>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
`);
{
 const path='components/patients/FollowupClosure.tsx';let text=readFileSync(path,'utf8');const start=text.indexOf('  {draft.error&&<button'),end=text.indexOf('\n',start);if(start<0||end<0)throw new Error('Missing recovery boundary');
 text=text.slice(0,start)+'  <ClinicalDraftRecovery draft={draft} reload={p.reload} sessionId={session.id} disabled={Object.values(writing).some(Boolean)||busy||p.finalizing}/>'+text.slice(end);writeFileSync(path,text);
}

// Reuse the existing payment RPC. No billing provider, new table, or clinical write.
patch('lib/patients/demo-runtime.ts','appointments:{id:string;session_id:string|null;appointment_type:',"appointments:{id:string;payment_status?:'unknown'|'pending'|'paid'|'not_applicable';updated_at?:string;patient_id?:string|null;session_id:string|null;appointment_type:");
patch('lib/patients/demo-runtime.ts','select=id,session_id,appointment_type,scheduled_start,scheduled_end,status&tester_id','select=id,patient_id,session_id,appointment_type,scheduled_start,scheduled_end,status,payment_status,updated_at&tester_id');
put('components/patients/VisitAdministration.tsx',`
'use client';
import {useEffect,useRef,useState} from 'react';
import {getDemoTesterId} from '@/lib/demo-tester';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import VisitNextAppointment from './VisitNextAppointment';
type Payment='unknown'|'pending'|'paid'|'not_applicable';
const choices:[Payment,string][]=[['paid','Πληρωμένο'],['pending','Εκκρεμεί'],['not_applicable','Χωρίς χρέωση'],['unknown','Δεν έχει σημειωθεί']];
export default function VisitAdministration({bundle,sessionId,reload,registerFlusher,onDirtyChange,disabled=false}:{bundle:PatientBundle;sessionId:string;reload:()=>Promise<unknown>;registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void;disabled?:boolean}){
 const linked=bundle.appointments.filter(a=>a.session_id===sessionId&&(!a.patient_id||a.patient_id===bundle.patient.id));const appointment=linked.length===1?linked[0]:undefined;
 const [confirmed,setConfirmed]=useState<{id:string;status:Payment;updatedAt:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const flight=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>registerFlusher('visit-payment',async()=>{if(flight.current)throw new Error('Η καταχώριση πληρωμής βρίσκεται σε εξέλιξη.')}),[registerFlusher]);
 useEffect(()=>{onDirtyChange('visit-payment',busy);return()=>onDirtyChange('visit-payment',false)},[busy,onDirtyChange]);
 const useConfirmed=confirmed?.id===appointment?.id&&(!appointment?.updated_at||Date.parse(confirmed.updatedAt)>=Date.parse(appointment.updated_at));
 const status=useConfirmed?confirmed!.status:appointment?.payment_status;
 async function save(next:Payment){if(!appointment||flight.current||disabled||next===status)return;flight.current=true;setBusy(true);setError('');let committed=false;
  try{const response=await fetch('/api/calendar/payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tester:getDemoTesterId(),event_id:appointment.id,status:next})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Δεν αποθηκεύτηκε η πληρωμή.');const event=data.event;
   if(!event||event.id!==appointment.id||event.patient_id!==bundle.patient.id||event.session_id!==sessionId||event.payment_status!==next||!Number.isFinite(Date.parse(event.updated_at)))throw new Error('Δεν επιβεβαιώθηκε η πληρωμή του συγκεκριμένου ραντεβού. Ανανεώστε πριν επαναλάβετε.');
   committed=true;if(mounted.current)setConfirmed({id:event.id,status:next,updatedAt:event.updated_at});const fresh=await reload();if(!fresh)throw new Error('refresh_unavailable');
  }catch(cause){if(mounted.current)setError(committed?'Η πληρωμή αποθηκεύτηκε, αλλά η προβολή δεν ανανεώθηκε. Μην την καταχωρίσετε ξανά.':cause instanceof Error?cause.message:'Δεν επιβεβαιώθηκε η πληρωμή.');}
  finally{flight.current=false;if(mounted.current)setBusy(false)}
 }
 return <section className="visit-part" aria-label="Διεκπεραίωση επίσκεψης"><header><h3>Διεκπεραίωση επίσκεψης</h3></header><div className="visit-part-surface">
  <p className="visit-hint">Η κλινική καταγραφή παραμένει οριστικοποιημένη. Οι παρακάτω ενέργειες είναι προαιρετικές.</p>
  <fieldset disabled={disabled||busy} style={{border:0,padding:0,margin:0,minWidth:0}}><div className="visit-related-fields"><section aria-label="Πληρωμή επίσκεψης"><h4>Πληρωμή</h4>
   {appointment?<><p role="status">{busy?'Αποθήκευση πληρωμής…':choices.find(([value])=>value===status)?.[1]||'Ανανέωση κατάστασης πληρωμής…'}</p><div role="group" aria-label="Κατάσταση πληρωμής">{choices.map(([value,label])=><button type="button" key={value} aria-pressed={status===value} onClick={()=>void save(value)}>{label}</button>)}</div></>:<p>{linked.length>1?'Χρειάζεται έλεγχος σύνδεσης ραντεβού πριν καταχωριστεί πληρωμή.':'Δεν υπάρχει συνδεδεμένο ραντεβού για καταχώριση πληρωμής.'}</p>}
   {error&&<p role="alert">{error}</p>}
  </section><VisitNextAppointment bundle={bundle} sessionId={sessionId} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></div></fieldset>
 </div></section>;
}
`);
patch('components/patients/PatientSession.tsx',"  return <CompletedSessionView session={selected} bundle={bundle} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onBack={()=>onSelectSession(null)} />;","  return <><VisitAdministration bundle={bundle} sessionId={selected.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} disabled={finalizing||!contextReady}/><CompletedSessionView session={selected} bundle={bundle} reload={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onBack={()=>onSelectSession(null)} /></>;");

// Return context contains calendar position only, never patient IDs or clinical text.
put('lib/calendar/return-context.ts',`
import {readCalendarPosition,type CalendarPosition} from './appointment-context.ts';
const departureKey='noima-calendar-departure',resumeKey='noima-calendar-resume';
export function validCalendarDeparture(value:unknown,workspace:string,fromCalendar:boolean,now=Date.now()):CalendarPosition|null{
 if(!value||typeof value!=='object')return null;const v=value as {at?:number;explicit?:boolean;position?:unknown};
 if(typeof v.at!=='number'||v.at>now||now-v.at>60000||(!v.explicit&&!fromCalendar))return null;
 return readCalendarPosition(v.position,workspace);
}
export function rememberCalendarDeparture(position:CalendarPosition,explicit=false){try{sessionStorage.setItem(departureKey,JSON.stringify({at:Date.now(),position,explicit}))}catch{}}
export function captureCalendarReturn(workspace:string){
 if(readCalendarPosition(history.state?.noimaVisitCalendar,workspace))return;
 try{const raw=sessionStorage.getItem(departureKey);sessionStorage.removeItem(departureKey);if(!raw)return;let fromCalendar=false;try{const ref=new URL(document.referrer);fromCalendar=ref.origin===location.origin&&ref.pathname==='/calendar'}catch{}
  const position=validCalendarDeparture(JSON.parse(raw),workspace,fromCalendar);if(position)history.replaceState({...history.state,noimaVisitCalendar:position},'');
 }catch{/* A direct entry safely falls back to today's calendar. */}
}
export function calendarReturnUrl(workspace:string){
 const position=readCalendarPosition(history.state?.noimaVisitCalendar,workspace);if(!position)return '/calendar';
 try{sessionStorage.setItem(resumeKey,JSON.stringify(position));return '/calendar?resumeVisit=1'}catch{return '/calendar'}
}
export function consumeCalendarResume(workspace:string):CalendarPosition|null{
 try{const raw=sessionStorage.getItem(resumeKey);sessionStorage.removeItem(resumeKey);return raw?readCalendarPosition(JSON.parse(raw),workspace):null}catch{return null}
}
`);
put('components/calendar/useCalendarPosition.ts',`
'use client';
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {readCalendarPosition,type CalendarPosition} from '@/lib/calendar/appointment-context';
import {consumeCalendarResume,rememberCalendarDeparture} from '@/lib/calendar/return-context';
import {getDemoTesterId} from '@/lib/demo-tester';
export function useCalendarPosition({date,view,filter,setDate,setView,setFilter,scroller,loading}:{date:string;view:'day'|'week';filter:string;setDate:(date:string)=>void;setView:(view:'day'|'week')=>void;setFilter:(filter:string)=>void;scroller:RefObject<HTMLElement|null>;loading:boolean}){
 const [ready,setReady]=useState(false);const restoring=useRef(false),saved=useRef<CalendarPosition|null>(null),explicitDeparture=useRef(false);
 useEffect(()=>{const workspace=getDemoTesterId(),url=new URL(location.href);let position=readCalendarPosition(history.state?.noimaCalendar,workspace);
  if(url.searchParams.get('resumeVisit')==='1'){position=consumeCalendarResume(workspace)||position;url.searchParams.delete('resumeVisit');history.replaceState({...history.state,...(position?{noimaCalendar:position}:{})},'',url.pathname+url.search+url.hash)}
  if(position){saved.current=position;restoring.current=true;setDate(position.date);setView(position.view);setFilter(position.filter)}
  if(!position&&matchMedia('(max-width: 760px)').matches)setView('day');setReady(true);
 },[setDate,setView,setFilter]);
 const remember=useCallback(()=>{if(!ready||restoring.current||location.pathname!=='/calendar')return;const workspace=getDemoTesterId();if(!workspace)return;const element=scroller.current;const position:CalendarPosition={workspace,date,view,filter,top:element?.scrollTop??0,left:element?.scrollLeft??0,pageTop:scrollY};history.replaceState({...history.state,noimaCalendar:position},'');},[ready,date,view,filter,scroller]);
 useEffect(()=>{if(!ready||loading||!restoring.current||!saved.current)return;const position=saved.current;const frame=requestAnimationFrame(()=>{scroller.current?.scrollTo({top:position.top,left:position.left,behavior:'instant'});scrollTo({top:position.pageTop,behavior:'instant'});restoring.current=false});return()=>cancelAnimationFrame(frame)},[ready,loading,view,scroller]);
 useEffect(()=>{remember();window.addEventListener('scroll',remember,{passive:true});return()=>window.removeEventListener('scroll',remember)},[remember]);
 useEffect(()=>{
  const leave=()=>{remember();const p=readCalendarPosition(history.state?.noimaCalendar,getDemoTesterId());if(p)rememberCalendarDeparture(p,explicitDeparture.current)};
  const click=(e:MouseEvent)=>{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const a=(e.target as Element).closest('a');if(!a||a.target==='_blank')return;const url=new URL(a.href);if(url.origin===location.origin&&url.pathname.startsWith('/patients/demo/')){explicitDeparture.current=true;leave()}};
  document.addEventListener('click',click,true);window.addEventListener('pagehide',leave);return()=>{document.removeEventListener('click',click,true);window.removeEventListener('pagehide',leave)};
 },[remember]);
 return {ready,restoring,remember};
}
`);
patch('components/patients/PatientWorkspace.tsx',"import PatientRecordSummary from './PatientRecordSummary';","import PatientRecordSummary from './PatientRecordSummary';\nimport {captureCalendarReturn,calendarReturnUrl} from '@/lib/calendar/return-context';");
patch('components/patients/PatientWorkspace.tsx','useEffect(()=>{navigationSequence.current++;shellLoadSequence.current++;','useEffect(()=>{captureCalendarReturn(getDemoTesterId());navigationSequence.current++;shellLoadSequence.current++;');
patch('components/patients/PatientWorkspace.tsx',' async function closeRecord(){'," async function returnToCalendar(){try{await beforeNavigate.current?.();window.location.assign(calendarReturnUrl(getDemoTesterId()))}catch(cause){setError(cause instanceof Error?cause.message:'Δεν αποθηκεύτηκαν οι αλλαγές.')}}\n async function closeRecord(){");
patch('components/patients/PatientWorkspace.tsx','<button type="button" onClick={()=>void closeRecord()} aria-label="Κλείσιμο καταγραφής και επιστροφή στον φάκελο"><X size={22}/></button>','<div className={styles.recordDialogControls}><button type="button" onClick={()=>void returnToCalendar()}>Επιστροφή στο πρόγραμμα</button><button type="button" onClick={()=>void closeRecord()} aria-label="Κλείσιμο καταγραφής και επιστροφή στον φάκελο"><X size={22}/></button></div>');
{
 const path='components/patients/PatientRecord.module.css';let css=readFileSync(path,'utf8');if(!css.includes('.recordDialogControls'))css+='\n.recordDialogControls{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;justify-content:flex-end}\n.recordDialogControls button:first-child{width:auto;font-size:.85rem;white-space:normal}\n';writeFileSync(path,css);
}
// Do not reload on clean navigation. Required finalization reads remain unchanged.
patch('components/patients/PatientSession.tsx','   const refreshed=await reload();','   const refreshed=await reload();');
patch('components/patients/PatientSession.tsx',"  try{\n   const refreshed=await reload();","  if(!requireRefresh){setFlushing(false);return null}\n  try{\n   const refreshed=await reload();");

// Keep browser coverage aligned with the dialog-based workspace.
{
 const path='browser-tests/clinical-reliability.mjs';let s=readFileSync(path,'utf8');
 s=s.replace("await page.getByRole('button',{name:'Καταγραφή',exact:true}).waitFor()","await page.getByRole('navigation',{name:'Καρτέλες φακέλου'}).waitFor()");
 s=s.replace("await nav('Σύνοψη').click();await nav('Καταγραφή').click();","await page.getByRole('button',{name:'Κλείσιμο καταγραφής και επιστροφή στον φάκελο',exact:true}).click();await page.getByRole('button',{name:/Συνέχεια πρόχειρης επίσκεψης/}).click();");
 s=s.replace("await page.getByText('Η καταγραφή οριστικοποιήθηκε.',{exact:true}).waitFor()","await page.getByText('Η καταγραφή οριστικοποιήθηκε.',{exact:true}).first().waitFor()");
 s=s.replace("await nav('Πορεία').click();await page.getByRole('heading',{name:'Πορεία',exact:true}).waitFor();","await page.getByRole('button',{name:'Κλείσιμο καταγραφής και επιστροφή στον φάκελο',exact:true}).click();await nav('Επισκέψεις').click();");
 writeFileSync(path,s);
}
{
 const path='.github/workflows/clinical-ui.yml';let s=readFileSync(path,'utf8');s=s.replace('on:\n  pull_request:', 'on:\n  workflow_dispatch:\n  pull_request:');s=s.replace("      - 'components/patients/**'","      - 'components/patients/**'\n      - 'components/calendar/**'\n      - 'app/calendar/**'\n      - 'app/patients/**'\n      - 'app/api/**'\n      - 'lib/calendar/**'\n      - 'lib/patients/**'\n      - 'supabase/**'\n      - 'tests/**'");writeFileSync(path,s);
}
console.log('Applied targeted visit workflow audit fixes; no database migrations or production operations.');
