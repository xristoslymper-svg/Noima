'use client';
import {useEffect,useRef,useState} from 'react';
import {CalendarDays,ChevronRight,Pencil} from 'lucide-react';
import type {DemoSession,PatientBundle} from '@/lib/patients/demo-runtime';
import {emptyContinuity,type ContinuityDraft} from '@/lib/clinical/continuity';
import {mseTimeline,previousMseReference,finalizationBlocker} from '@/lib/clinical/visit-workspace-state';
import {useFollowupDraft,FollowupField} from './FollowupDraft';
import RiskEditor from './RiskTreeEditor';
import StructuredVisitEditor from './StructuredVisitEditor';
import {MedicationModal} from './PatientPanels';
import VisitScores from './VisitScores';
import VisitNextAppointment from './VisitNextAppointment';
import {formatClinicDate,formatClinicDateTime} from '@/lib/clinic-time';
import {continuityContexts} from '@/lib/clinical/continuity-context';
import {readMedicationResponse,updateMedicationResponse,type MedicationResponse} from '@/lib/clinical/medication-response-note';
import MobileFollowupTools from '@/components/mobile/MobileFollowupTools';
import StableDetails from './StableDetails';
import {mobileV2Enabled} from '@/components/mobile/mobile-v2';
import mobileStyles from '@/components/mobile/MobileClinical.module.css';
import styles from './FollowupClosure.module.css';

type Props={bundle:PatientBundle;session:DemoSession;reload:()=>Promise<unknown>;reloadContext:()=>Promise<unknown>;contextReady:boolean;registerFlusher:(key:string,f:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void;flushAll:(requireRefresh?:boolean)=>Promise<unknown>;onDetailed:()=>void;onFinalize:(version:number)=>Promise<void>;onFinishLater?:()=>Promise<void>;finalizing:boolean;finalizeError:string};
export default function FollowupClosure(p:Props){
 const {bundle,session,registerFlusher,onDirtyChange}=p;
 const {draft,checkConsistency}=useFollowupDraft();
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [writing,setWriting]=useState<Record<string,boolean>>({});
 const currentDraft=useRef(draft);currentDraft.current=draft;
 const flight=useRef(false);
 const [med,setMed]=useState<{mode:'start'|'change'|'stop'|'side_effect';id?:string}|null>(null);
 useEffect(()=>registerFlusher('closure-medication',async()=>{if(med)throw new Error('Ολοκληρώστε πρώτα την καταχώρηση αγωγής.')}),[registerFlusher,med]);
 function change(key:keyof ContinuityDraft,value:string){const latest=currentDraft.current;latest.change({...latest.currentValue(),[key]:value})}
 function selectMedicationResponse(medication:PatientBundle['medications'][number],response:MedicationResponse){
  const value=currentDraft.current.currentValue();
  const selected=readMedicationResponse(value.clinical_state_summary,medication);
  const updated=updateMedicationResponse(value.clinical_state_summary,medication,selected===response?null:response);
  if(updated.length>20000){setError('Η κλινική εικόνα έφτασε το μέγιστο μήκος. Συντομεύστε το κείμενο για να καταγράψετε ανταπόκριση.');return}
  setError('');
  change('clinical_state_summary',updated);
 }
 function writingField(key:'transcript'|'clinical_state_summary'|'treatment_decision'|'next_review_focus'|'adherence'|'pinned_context',title:string,placeholder='',rows=2){return <FollowupField field={key} title={title} placeholder={placeholder} rows={rows} onPendingChange={pending=>setWriting(v=>v[key]===pending?v:{...v,[key]:pending})}/>}
 async function finalize(){if(flight.current)return;flight.current=true;setBusy(true);setError('');try{const fresh=await p.flushAll(true) as PatientBundle;checkConsistency(fresh);const timeline=mseTimeline(fresh,session.id,session.started_at);const sections=fresh.sections.filter(s=>s.session_id===session.id);const blocker=finalizationBlocker([...sections,...['interview','assessment','plan','review'].filter(k=>!sections.some(s=>s.section_key===k&&s.content.trim())).map(k=>({section_key:k,content:'Επιβεβαιωμένη κλινική μνήμη'}))],fresh.risks.find(r=>r.session_id===session.id),{kind:'mse',fields:Object.values(timeline.references).map(r=>r.field)});if(blocker)throw new Error(blocker.message);await p.onFinalize(draft.version()||0)}catch(e){setError(e instanceof Error?e.message:'Δεν ολοκληρώθηκε η επίσκεψη.')}finally{flight.current=false;setBusy(false)}}
 const risk=bundle.risks.find(r=>r.session_id===session.id);
 const mse=bundle.sections.find(s=>s.session_id===session.id&&s.section_key==='mse');
 const reference=previousMseReference(bundle,session.id,session.started_at);
 const contextItems=continuityContexts(bundle).filter(i=>i.status==='active');
 const activeMedications=bundle.medications.filter(m=>m.status==='active');
 const medicationChanges=bundle.medicationEvents.filter(e=>e.session_id===session.id&&e.event_type==='changed'&&!(bundle.medicationRevisions||[]).some(r=>r.event_id===e.id));
 const timeline=p.contextReady?mseTimeline(bundle,session.id,session.started_at):undefined;
 return <section className={styles.closure+(mobileV2Enabled?` ${mobileStyles.followup}`:``)} data-clinical-followup="true">
  <header className={styles.heading}><div><span className="kicker">ΕΠΑΝΕΞΕΤΑΣΗ</span><h2>Σημερινή καταγραφή</h2><p className={styles.cardMeta}>{formatClinicDateTime(session.started_at)} · Πρόχειρη</p></div><button type="button" onClick={p.onDetailed} disabled={busy}>Αναλυτική καταγραφή <ChevronRight size={15} aria-hidden="true"/></button></header>
  <MobileFollowupTools/><section className={styles.card} data-mobile-section="notes" tabIndex={mobileV2Enabled?-1:undefined} aria-label="Σημειώσεις επίσκεψης">
   {writingField('transcript','Σημειώσεις επίσκεψης','Τι ανέφερε ο ασθενής, ποια ήταν η πορεία του, τι άλλαξε σήμερα…',4)}
  </section>
  <section className={styles.card} data-followup-clinical-group="true" data-mobile-section="clinical" tabIndex={mobileV2Enabled?-1:undefined}>
   <div className={styles.cardHeading}><h3>Κλινική καταγραφή</h3></div>
   <div className={styles.fields+" visit-part-surface"}>
    <div>{writingField('clinical_state_summary','Κλινική εικόνα','Συμπτώματα, λειτουργικότητα, μεταβολές…')}</div>
    <div className={styles.planGroup} data-followup-plan-group="true">
     <h4>Θεραπευτική απόφαση & επανέλεγχος</h4>
     <div className={styles.planFields}>
      <div>{writingField('treatment_decision','Απόφαση / παρεμβάσεις','Αγωγή, παρεμβάσεις ή αλλαγές στο πλάνο…')}</div>
      <div>{writingField('next_review_focus','Τι θα επανεκτιμηθεί','Συμπτώματα, ανταπόκριση ή στόχοι επόμενης επίσκεψης…')}</div>
     </div>
    </div>
   </div>
  </section>
  <section className={styles.card} data-followup-medication-group="true" data-mobile-section="medication" tabIndex={mobileV2Enabled?-1:undefined}>
   <h3>Τρέχουσα αγωγή</h3>
   <div className="visit-part-surface">
    {medicationChanges.map(e=><p key={e.id}>Αλλαγή: {String(e.new_state?.medication_name||'Αγωγή')} · {String(e.previous_state?.dose??'—')} {String(e.previous_state?.unit||'')} → {String(e.new_state?.dose??'—')} {String(e.new_state?.unit||'')} · Ισχύει από {formatClinicDate(e.effective_on)}</p>)}
    {p.contextReady?<div className="clinical-table-wrap medication-table-editor"><table className="clinical-lean-table medication-lean-table"><caption className="sr-only">Αγωγή</caption><thead><tr><th>Φάρμακο</th><th>Δόση</th><th>Συχνότητα</th><th>Περίοδος</th><th>Κατάσταση</th><th>Ανταπόκριση</th><th>Παρενέργειες</th><th>Ενέργειες</th></tr></thead><tbody>{activeMedications.map(m=>{
     const selectedResponse=readMedicationResponse(draft.value.clinical_state_summary,m);
     const hasRecordedSideEffect=bundle.medicationSideEffects.some(e=>e.medication_id===m.id&&e.session_id===session.id);
     return <tr key={m.id} data-medication-response={m.id}>
      <th scope="row">{m.medication_name}</th><td><span className="med-dose-display">{m.dose}<b>{m.unit}</b></span></td><td>{m.frequency}</td><td>{formatClinicDate(m.started_at)}</td><td><span className="med-status active">Λαμβάνει</span></td>
      <td><div className={styles.responseOptions} role="group" aria-label={'Ανταπόκριση στην αγωγή '+m.medication_name}>
       <button type="button" aria-pressed={selectedResponse==='good'} disabled={writing.clinical_state_summary||busy||p.finalizing} onClick={()=>selectMedicationResponse(m,'good')}>Καλή</button>
       <button type="button" aria-pressed={selectedResponse==='neutral'} disabled={writing.clinical_state_summary||busy||p.finalizing} onClick={()=>selectMedicationResponse(m,'neutral')}>Ουδέτερη</button>
      </div></td>
      <td><div className={styles.tolerabilityOptions} role="group" aria-label={'Ανοχή αγωγής '+m.medication_name}>
       <button type="button" onClick={()=>setMed({mode:'side_effect',id:m.id})}>Παρενέργεια</button>
       {hasRecordedSideEffect&&<span className={styles.recordedEffect}>Υπάρχει σημερινή καταγραφή</span>}
      </div></td>
      <td className="med-row-actions"><button type="button" title="Αλλαγή δόσης ή συχνότητας" aria-label={'Αλλαγή δόσης ή συχνότητας για '+m.medication_name} onClick={()=>setMed({mode:'change',id:m.id})}><Pencil size={16} aria-hidden="true"/>Τροποποίηση</button></td>
     </tr>;
    })}
    <tr><td colSpan={8}><button type="button" className="med-add-row" onClick={()=>setMed({mode:'start'})}>+ Προσθήκη αγωγής</button></td></tr></tbody></table></div>:<p role="status">Φόρτωση αγωγής…</p>}
    {writingField('adherence','Λήψη αγωγής','Παραλείψεις, δυσκολίες ή αλλαγές στη λήψη…')}
   </div>
  </section>
  <StableDetails key={session.id+':mse'} data-mobile-section='mse' tabIndex={mobileV2Enabled?-1:undefined} className={styles.details} initialOpen={!mse?.content.trim()}><summary>MSE · {mse?.content.trim()?'Καταγεγραμμένο — έλεγχος':'Χρειάζεται σημερινή ανασκόπηση'}</summary><div className="visit-part-content">{p.contextReady?<StructuredVisitEditor sessionId={session.id} kind="mse" compact existing={mse} followup baseline={reference?.section} timeline={timeline} onSaved={p.reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>:<p>Φόρτωση προηγούμενου MSE…</p>}</div></StableDetails>
  <StableDetails key={session.id+':risk'} data-mobile-section='risk' tabIndex={mobileV2Enabled?-1:undefined} className={styles.details} initialOpen={!risk||risk.suicidal_ideation==='not_assessed'||risk.suicidal_ideation==='positive'}><summary>Κίνδυνος · {risk&&risk.suicidal_ideation!=='not_assessed'?'Σημερινή καταγραφή':'Χρειάζεται σημερινή εκτίμηση'}</summary><div className="visit-part-surface"><RiskEditor sessionId={session.id} existing={risk} onSaved={p.reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></div></StableDetails>
  <details className={styles.details} data-mobile-section="measures" tabIndex={mobileV2Enabled?-1:undefined}><summary>Ψυχομετρικές μετρήσεις</summary><div className="visit-part-surface">{p.contextReady&&<VisitScores bundle={bundle} sessionId={session.id} reload={p.reloadContext}/>}</div></details>
  {(contextItems.length>0||draft.value.pinned_context.trim())&&<details className={styles.details}>
   <summary>Σημαντικά θέματα προηγούμενων καταγραφών{contextItems.length?' · '+contextItems.length:''}</summary>
   <div className="visit-part-surface">
    {contextItems.map(item=><p className={styles.contextItem} key={item.id}>{item.content}</p>)}
    {draft.value.pinned_context.trim()&&<p className={styles.contextItem}><strong>Προϋπάρχουσα σημείωση προχείρου:</strong> {draft.value.pinned_context}</p>}
   </div>
  </details>}
  {p.contextReady&&<section className={styles.appointmentCard} aria-label="Επόμενο ραντεβού" data-mobile-section="appointment" tabIndex={mobileV2Enabled?-1:undefined}><div className={styles.appointmentHeading}><CalendarDays size={21} aria-hidden="true"/><h3>Επόμενο ραντεβού</h3></div><div className="visit-part-surface"><VisitNextAppointment bundle={bundle} reload={p.reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></div></section>}
  <p role="status">{draft.saving?'Αποθήκευση προχείρου…':draft.error||(draft.savedAt?'Πρόχειρο αποθηκευμένο · '+draft.savedAt:'')}</p>
  {draft.error&&<button type="button" disabled={Object.values(writing).some(Boolean)} onClick={()=>void p.reload().then(b=>{const s=(b as PatientBundle).sessions.find(s=>s.id===session.id);if(s){draft.acceptServer(s.closure_draft||emptyContinuity,s.closure_version||0)}}).catch(e=>setError(e.message))}>Φόρτωση αποθηκευμένου προχείρου</button>}
  {(error||p.finalizeError)&&<p role="alert">{error||p.finalizeError}</p>}
  <div className={styles.footerActions}><button type="button" className={styles.actionPrimary} disabled={busy||p.finalizing||Boolean(med)||!p.contextReady} onClick={()=>void finalize()}>{busy||p.finalizing?'Οριστικοποίηση…':'Ολοκλήρωση καταγραφής'}</button>{p.onFinishLater&&<button type="button" disabled={busy||p.finalizing||Boolean(med)} onClick={()=>void p.onFinishLater?.()}>Συνέχεια αργότερα</button>}</div>
  {med&&<MedicationModal bundle={bundle} sessionId={session.id} initialMode={med.mode} initialMedicationId={med.id} onClose={()=>setMed(null)} onSaved={async()=>{await p.reloadContext();setMed(null)}}/>}
 </section>;
}
