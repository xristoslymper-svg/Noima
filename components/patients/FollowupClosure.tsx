'use client';
import {useEffect,useRef,useState} from 'react';
import {CalendarDays,ChevronRight} from 'lucide-react';
import type {DemoSession,PatientBundle} from '@/lib/patients/demo-runtime';
import {emptyContinuity,type ContinuityDraft} from '@/lib/clinical/continuity';
import {mseTimeline,previousMseReference,finalizationBlocker} from '@/lib/clinical/visit-workspace-state';
import {demoPost} from '@/lib/patients/demo-client';
import {useClinicalDraft} from './useClinicalDraft';
import ClinicalTextField from '@/components/dictation/ClinicalTextField';
import RiskEditor from './RiskTreeEditor';
import StructuredVisitEditor from './StructuredVisitEditor';
import {MedicationModal} from './PatientPanels';
import VisitScores from './VisitScores';
import VisitNextAppointment from './VisitNextAppointment';
import {formatClinicDate,formatClinicDateTime} from '@/lib/clinic-time';
import {continuityContexts} from '@/lib/clinical/continuity-context';
import StableDetails from './StableDetails';
import styles from './FollowupClosure.module.css';

type Props={bundle:PatientBundle;session:DemoSession;reload:()=>Promise<unknown>;reloadContext:()=>Promise<unknown>;contextReady:boolean;registerFlusher:(key:string,f:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void;flushAll:(requireRefresh?:boolean)=>Promise<unknown>;onDetailed:()=>void;onFinalize:(version:number)=>Promise<void>;onFinishLater?:()=>Promise<void>;finalizing:boolean;finalizeError:string};
export default function FollowupClosure(p:Props){
 const {bundle,session,registerFlusher,onDirtyChange}=p;
 const text=(key:string)=>bundle.sections.find(s=>s.session_id===session.id&&s.section_key===key)?.content||'';
 const initial:ContinuityDraft=session.closure_draft||{...emptyContinuity,clinical_state_summary:text('interview'),treatment_decision:text('plan'),next_review_focus:text('review'),adherence:text('adherence')};
 const draft=useClinicalDraft<ContinuityDraft>({storageKey:session.id+':closure',initial,version:session.closure_version||0,write:async(value,version)=>{const result=await demoPost({action:'save_closure',session_id:session.id,value,expected_version:version});return {value:result.session.closure_draft,version:result.session.closure_version}},onSaved:p.reload,onDirty:dirty=>onDirtyChange('closure',dirty)});
 useEffect(()=>registerFlusher('closure',draft.flush),[registerFlusher,draft.flush]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [writing,setWriting]=useState<Record<string,boolean>>({});
 const currentDraft=useRef(draft);currentDraft.current=draft;
 const flight=useRef(false);
 const [med,setMed]=useState<{mode:'start'|'change'|'stop'|'side_effect';id?:string}|null>(null);
 useEffect(()=>registerFlusher('closure-medication',async()=>{if(med)throw new Error('Ολοκληρώστε πρώτα την καταχώρηση αγωγής.')}),[registerFlusher,med]);
 function change(key:keyof ContinuityDraft,value:string){const latest=currentDraft.current;latest.change({...latest.currentValue(),[key]:value})}
 function writingField(key:'transcript'|'clinical_state_summary'|'treatment_decision'|'next_review_focus'|'adherence'|'pinned_context',title:string,placeholder='',rows=2){return <ClinicalTextField sessionId={session.id} section="closure" fieldKey={key} title={title} placeholder={placeholder} rows={rows} maxLength={key==='pinned_context'?2000:20000} value={draft.value[key]} onPendingChange={pending=>setWriting(v=>v[key]===pending?v:{...v,[key]:pending})} onChange={text=>change(key,text)} onBlur={()=>void draft.flush().catch(()=>{})} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onConfirm={async(text,{provenance})=>{
  await currentDraft.current.flush();const latest=currentDraft.current;
  const value=latest.currentValue();if(value[key]!==provenance.original)throw new Error('Η αρχική καταγραφή άλλαξε. Ελέγξτε τη νεότερη έκδοση.');
  latest.change({...value,[key]:text,source:provenance.kind==='ai'?'ai_assisted':value.source,writing_provenance:{...value.writing_provenance,[key]:provenance}});
  await latest.flush().catch(()=>{});
 }}/>}
 async function finalize(){if(flight.current)return;flight.current=true;setBusy(true);setError('');try{const fresh=await p.flushAll(true) as PatientBundle;const timeline=mseTimeline(fresh,session.id,session.started_at);const sections=fresh.sections.filter(s=>s.session_id===session.id);const blocker=finalizationBlocker([...sections,...['interview','assessment','plan','review'].filter(k=>!sections.some(s=>s.section_key===k&&s.content.trim())).map(k=>({section_key:k,content:'Επιβεβαιωμένη κλινική μνήμη'}))],fresh.risks.find(r=>r.session_id===session.id),{kind:'mse',fields:Object.values(timeline.references).map(r=>r.field)});if(blocker)throw new Error(blocker.message);await p.onFinalize(draft.version()||0)}catch(e){setError(e instanceof Error?e.message:'Δεν ολοκληρώθηκε η επίσκεψη.')}finally{flight.current=false;setBusy(false)}}
 const risk=bundle.risks.find(r=>r.session_id===session.id);
 const mse=bundle.sections.find(s=>s.session_id===session.id&&s.section_key==='mse');
 const reference=previousMseReference(bundle,session.id,session.started_at);
 const contextItems=continuityContexts(bundle).filter(i=>i.status==='active');
 const activeMedications=bundle.medications.filter(m=>m.status==='active');
 const medicationChanges=bundle.medicationEvents.filter(e=>e.session_id===session.id&&e.event_type==='changed'&&!(bundle.medicationRevisions||[]).some(r=>r.event_id===e.id));
 const timeline=p.contextReady?mseTimeline(bundle,session.id,session.started_at):undefined;
 return <section className={styles.closure} data-clinical-followup="true">
  <header className={styles.heading}><div><span className="kicker">ΕΠΑΝΕΞΕΤΑΣΗ</span><h2>Σημερινή καταγραφή</h2><p className={styles.cardMeta}>{formatClinicDateTime(session.started_at)} · Πρόχειρη</p></div><button type="button" onClick={p.onDetailed} disabled={busy}>Αναλυτική καταγραφή <ChevronRight size={15} aria-hidden="true"/></button></header>
  <section className={styles.card} aria-label="Σημειώσεις επίσκεψης">
   {writingField('transcript','Σημειώσεις επίσκεψης','Τι ανέφερε ο ασθενής, ποια ήταν η πορεία του, τι άλλαξε σήμερα…',4)}
  </section>
  <section className={styles.card}><div className={styles.cardHeading}><h3>Κλινική καταγραφή</h3></div><div className={styles.fields}>{([['clinical_state_summary','Κλινική εικόνα'],['treatment_decision','Θεραπευτική απόφαση'],['next_review_focus','Στην επόμενη επίσκεψη']] as const).map(([k,label])=><div key={k}>{writingField(k,label,{clinical_state_summary:'Συμπτώματα, λειτουργικότητα, μεταβολές…',treatment_decision:'Αγωγή, παρεμβάσεις ή αλλαγές στο πλάνο…',next_review_focus:'Τι χρειάζεται να επανεκτιμηθεί…'}[k])}{!draft.value[k].trim()&&k==='treatment_decision'&&<button type="button" disabled={writing.treatment_decision} onClick={()=>change('treatment_decision','Δεν ελήφθη νέα θεραπευτική απόφαση στη σημερινή επίσκεψη.')}>Δεν ελήφθη νέα απόφαση</button>}{!draft.value[k].trim()&&k==='next_review_focus'&&<button type="button" disabled={writing.next_review_focus} onClick={()=>change('next_review_focus','Δεν ορίστηκε συγκεκριμένος επόμενος έλεγχος στη σημερινή επίσκεψη.')}>Δεν ορίστηκε επόμενος έλεγχος</button>}</div>)}</div></section>
  {p.contextReady?(activeMedications.length>0||draft.value.adherence.trim()?<section className={styles.card}>{!draft.value.adherence&&<div className={styles.actions}>{['Κανονική λήψη','Υπήρξε θέμα','Δεν αξιολογήθηκε'].map(label=><button type="button" disabled={writing.adherence} key={label} onClick={()=>change('adherence',label)}>{label}</button>)}</div>}{writingField('adherence','Σημερινή ανασκόπηση λήψης')}</section>:null):<p role="status">Φόρτωση αγωγής…</p>}
  <section className={styles.card}><h3>Τρέχουσα αγωγή</h3>{p.contextReady&&activeMedications.length>1&&<button type="button" disabled={writing.treatment_decision} onClick={()=>change('treatment_decision','Συνέχιση της καταχωρισμένης αγωγής χωρίς αλλαγή: '+activeMedications.map(m=>m.medication_name+' '+m.dose+' '+m.unit+' · '+m.frequency).join('; ')+'.')}>Χωρίς αλλαγή στην καταχωρισμένη αγωγή</button>}{medicationChanges.map(e=><p key={e.id}>Αλλαγή: {String(e.new_state?.medication_name||'Αγωγή')} · {String(e.previous_state?.dose??'—')} {String(e.previous_state?.unit||'')} → {String(e.new_state?.dose??'—')} {String(e.new_state?.unit||'')} · Ισχύει από {formatClinicDate(e.effective_on)}</p>)}{p.contextReady?<>{activeMedications.map(m=><div className={styles.medication} key={m.id}><span>{m.medication_name} · {m.dose} {m.unit} · {m.frequency}</span><button type="button" disabled={writing.treatment_decision} onClick={()=>change('treatment_decision','Συνέχιση '+m.medication_name+' '+m.dose+' '+m.unit+' · '+m.frequency+' χωρίς αλλαγή.')}>Χωρίς αλλαγή</button><button type="button" onClick={()=>setMed({mode:'change',id:m.id})}>Αλλαγή</button><button type="button" onClick={()=>setMed({mode:'side_effect',id:m.id})}>Παρενέργεια</button></div>)}<button type="button" onClick={()=>setMed({mode:'start'})}>Προσθήκη αγωγής</button></>:<p role="status">Φόρτωση αγωγής…</p>}</section>
  <StableDetails key={session.id+':mse'} className={styles.details} initialOpen={!mse?.content.trim()}><summary>MSE · {mse?.content.trim()?'Καταγεγραμμένο — έλεγχος':'Χρειάζεται σημερινή ανασκόπηση'}</summary>{p.contextReady?<StructuredVisitEditor sessionId={session.id} kind="mse" compact existing={mse} followup baseline={reference?.section} timeline={timeline} onSaved={p.reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>:<p>Φόρτωση προηγούμενου MSE…</p>}</StableDetails>
  <StableDetails key={session.id+':risk'} className={styles.details} initialOpen={!risk||risk.suicidal_ideation==='not_assessed'||risk.suicidal_ideation==='positive'}><summary>Κίνδυνος · {risk&&risk.suicidal_ideation!=='not_assessed'?'Σημερινή καταγραφή':'Χρειάζεται σημερινή εκτίμηση'}</summary><RiskEditor sessionId={session.id} existing={risk} onSaved={p.reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></StableDetails>
  <details className={styles.details}><summary>Ψυχομετρικές μετρήσεις</summary>{p.contextReady&&<VisitScores bundle={bundle} sessionId={session.id} reload={p.reloadContext}/>}</details>
  <details className={styles.details}><summary>Σημαντικά θέματα για τη συνέχεια{contextItems.length?' · '+contextItems.length:''}</summary>
    {contextItems.map(item=><p className={styles.contextItem} key={item.id}>{item.content}</p>)}
    {writingField('pinned_context','Τι αξίζει να θυμόμαστε','Π.χ. σημαντικό γεγονός, εκκρεμότητα ή προσωπικό θέμα που επηρεάζει την πορεία…')}
  </details>
  {p.contextReady&&<section className={styles.appointmentCard} aria-label="Επόμενο ραντεβού"><div className={styles.appointmentHeading}><CalendarDays size={21} aria-hidden="true"/><h3>Επόμενο ραντεβού</h3></div><VisitNextAppointment bundle={bundle} reload={p.reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></section>}
  <p role="status">{draft.saving?'Αποθήκευση προχείρου…':draft.error||(draft.savedAt?'Πρόχειρο αποθηκευμένο · '+draft.savedAt:'')}</p>
  {draft.error&&<button type="button" disabled={Object.values(writing).some(Boolean)} onClick={()=>void p.reload().then(b=>{const s=(b as PatientBundle).sessions.find(s=>s.id===session.id);if(s){draft.acceptServer(s.closure_draft||emptyContinuity,s.closure_version||0)}}).catch(e=>setError(e.message))}>Φόρτωση αποθηκευμένου προχείρου</button>}
  {(error||p.finalizeError)&&<p role="alert">{error||p.finalizeError}</p>}
  <div className={styles.footerActions}><button type="button" className={styles.actionPrimary} disabled={busy||p.finalizing||Boolean(med)||!p.contextReady} onClick={()=>void finalize()}>{busy||p.finalizing?'Οριστικοποίηση…':'Ολοκλήρωση καταγραφής'}</button>{p.onFinishLater&&<button type="button" disabled={busy||p.finalizing||Boolean(med)} onClick={()=>void p.onFinishLater?.()}>Συνέχεια αργότερα</button>}</div>
  {med&&<MedicationModal bundle={bundle} sessionId={session.id} initialMode={med.mode} initialMedicationId={med.id} onClose={()=>setMed(null)} onSaved={async()=>{await p.reloadContext();setMed(null)}}/>}
 </section>;
}
