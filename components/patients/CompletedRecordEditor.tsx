'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {X,Check} from 'lucide-react';
import type {DemoRisk,DemoSession,PatientBundle} from '@/lib/patients/demo-runtime';
import type {VisitDocument,DocumentField} from '@/lib/clinical/visit-document';
import {initialDocument,mseItems} from '@/lib/clinical/visit-document';
import {effectiveDocument,effectiveRisk,effectiveText,correctionsFor} from '@/lib/clinical/corrections';
import {demoPost} from '@/lib/patients/demo-client';
import {formatClinicDateTime} from '@/lib/clinic-time';
import MseDomain from './MseDomain';
import ICD10Picker from './ICD10Picker';

const narrativeKeys=['interview','adherence','effects','functioning','plan','review'] as const;
const assessmentLabels:Record<string,string>={diagnosis:'Διάγνωση',formulation:'Διατύπωση περίπτωσης',impression:'Κλινική αποτίμηση'};
const riskOptions=[['not_assessed','Δεν διερευνήθηκε'],['unknown','Άγνωστο'],['negative','Αρνητικό'],['positive','Θετικό']] as const;
function riskShape(r?:DemoRisk){return {suicidal_ideation:r?.suicidal_ideation||'not_assessed',intent:r?.intent||'not_assessed',plan:r?.plan||'not_assessed',self_harm:r?.self_harm||'not_assessed',attempt_history:r?.attempt_history||'not_assessed',harm_to_others:r?.harm_to_others||'not_assessed',protective_factors:r?.protective_factors||'',clinical_note:r?.clinical_note||'',tree:r?.tree};}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

export default function CompletedRecordEditor({session,bundle,reload,onBack,registerFlusher,onDirtyChange}:{session:DemoSession;bundle:PatientBundle;reload:()=>Promise<unknown>;onBack:()=>void;registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void}){
 const corrections=bundle.corrections||[];
 const sections=bundle.sections.filter(section=>section.session_id===session.id);
 const find=(key:string)=>sections.find(section=>section.section_key===key);
 const effectiveMse=effectiveDocument(find('mse'),corrections,session.id,'mse');
 const effectiveAssessment=effectiveDocument(find('assessment'),corrections,session.id,'assessment');
 const baseMse=useMemo(()=>initialDocument('mse',effectiveText(find('mse'),corrections,session.id,'mse'),effectiveMse),[bundle,session.id]);
 const baseAssessment=useMemo(()=>initialDocument('assessment',effectiveText(find('assessment'),corrections,session.id,'assessment'),effectiveAssessment),[bundle,session.id]);
 const baseRisk=useMemo(()=>riskShape(effectiveRisk(bundle.risks.find(item=>item.session_id===session.id),corrections,session.id)),[bundle,session.id]);
 const baseNarrative=useMemo(()=>Object.fromEntries(narrativeKeys.map(key=>[key,effectiveText(find(key),corrections,session.id,key)])) as Record<(typeof narrativeKeys)[number],string>,[bundle,session.id]);

 const [editing,setEditing]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const correctionRequest=useRef<string|null>(null);
 const [mse,setMse]=useState<VisitDocument>(baseMse),[assessment,setAssessment]=useState<VisitDocument>(baseAssessment),[risk,setRisk]=useState(baseRisk),[narrative,setNarrative]=useState(baseNarrative);
 useEffect(()=>{setMse(baseMse);setAssessment(baseAssessment);setRisk(baseRisk);setNarrative(baseNarrative);setReason('');setError('')},[session.id,bundle.corrections?.length]);

 function reset(){setMse(baseMse);setAssessment(baseAssessment);setRisk(baseRisk);setNarrative(baseNarrative);setReason('');setError('');setEditing(false);correctionRequest.current=null}
 function changeMse(index:number,text:string){setMse(current=>({...current,fields:current.fields.map((field,i)=>i===index?{...field,text}:field)}))}
 function changeAssessment(index:number,change:Partial<DocumentField>){setAssessment(current=>({...current,fields:current.fields.map((field,i)=>i===index?{...field,...change}:field)}))}
 function makePatch(){
  const value:Record<string,{before:unknown;after:unknown}>={};
  for(const key of narrativeKeys)if(!same(baseNarrative[key],narrative[key]))value[key]={before:baseNarrative[key],after:narrative[key]};
  if(!same(baseMse,mse))value.mse={before:baseMse,after:mse};
  if(!same(baseAssessment,assessment))value.assessment={before:baseAssessment,after:assessment};
  if(!same(baseRisk,risk))value.risk={before:baseRisk,after:risk};
  return value;
 }
 const pending=Object.keys(makePatch()).length;
 const history=correctionsFor(corrections,session.id);
 const correctionDirty=editing&&(pending>0||Boolean(reason.trim()));
 const correctionKey='completed-correction:'+session.id;
 useEffect(()=>{onDirtyChange(correctionKey,correctionDirty);return()=>onDirtyChange(correctionKey,false)},[correctionKey,correctionDirty,onDirtyChange]);
 useEffect(()=>registerFlusher(correctionKey,async()=>{if(correctionDirty)throw new Error('Αποθηκεύστε ή ακυρώστε τη διόρθωση πριν φύγετε από την καταγραφή.')}),[correctionKey,correctionDirty,registerFlusher]);
 async function save(){
  if(!pending||!reason.trim()||busy)return;setBusy(true);setError('');
  const requestId=correctionRequest.current||(correctionRequest.current=crypto.randomUUID());
  try{await demoPost({action:'correct_session',session_id:session.id,request_id:requestId,reason:reason.trim(),patch:makePatch(),expected_count:history.length});await reload();setEditing(false);setReason('');correctionRequest.current=null}
  catch(e){setError(e instanceof Error?e.message:'Δεν αποθηκεύτηκε η διόρθωση.')}
  finally{setBusy(false)}
 }
 return <section className="session-workspace completed-session-view corrected-record-view">
  <div className="session-work-head">
   <div><button className="session-back-button" onClick={()=>{if(correctionDirty){setError('Αποθηκεύστε ή ακυρώστε τη διόρθωση πριν φύγετε από την καταγραφή.');return}onBack()}}>← Συνεδρίες</button><span className="visit-label completed"><span>ΟΡΙΣΤΙΚΟΠΟΙΗΜΕΝΟ</span><i/> {session.session_type==='initial_assessment'?'ΑΡΧΙΚΗ ΑΞΙΟΛΟΓΗΣΗ':'FOLLOW-UP'}</span><h2>{session.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επαναληπτική συνεδρία'}</h2><p>Η αρχική καταγραφή παραμένει αμετάβλητη. Οι διορθώσεις αποθηκεύονται ξεχωριστά με audit trail.</p></div>
   <div className="completed-record-actions"><span className="draft-updated">Ολοκληρώθηκε {formatClinicDateTime(session.completed_at||session.started_at)}</span>{!editing&&<button type="button" onClick={()=>{correctionRequest.current=crypto.randomUUID();setEditing(true);setError('')}}>Διόρθωση καταγραφής</button>}</div>
  </div>

  <fieldset disabled={!editing||busy} className="visit-document completed-record-form">
   <section className="visit-part"><header><h3>{session.session_type==='follow_up'?'Συμπτώματα / πορεία':'Λόγος προσέλευσης & παρούσα εικόνα'}</h3></header><div><textarea rows={4} value={narrative.interview} onChange={e=>setNarrative(v=>({...v,interview:e.target.value}))}/></div></section>
   {session.session_type==='follow_up'&&<section className="visit-part"><header><h3>Παρενέργειες & λήψη αγωγής</h3></header><div className="completed-correction-grid"><label>Συμμόρφωση<textarea rows={3} value={narrative.adherence} onChange={e=>setNarrative(v=>({...v,adherence:e.target.value}))}/></label><label>Παρενέργειες<textarea rows={3} value={narrative.effects} onChange={e=>setNarrative(v=>({...v,effects:e.target.value}))}/></label></div></section>}
   <section className="visit-part"><header><h3>MSE</h3></header><div className="mse-columns">{[mseItems.slice(0,6),mseItems.slice(6)].map((items,column)=><div className="mse-column" key={column}>{items.map(([key])=>{const index=mse.fields.findIndex(field=>field.key===key);if(index<0)return null;return <MseDomain key={key} field={mse.fields[index]} onChange={text=>changeMse(index,text)} onBlur={()=>{}}/>})}</div>)}</div>{mse.fields.map((field,index)=>field.key==='legacy'?<MseDomain key="legacy" field={field} onChange={text=>changeMse(index,text)} onBlur={()=>{}}/>:null)}</section>
   <section className="visit-part"><header><h3>Εκτίμηση κινδύνου</h3></header><div className="completed-correction-grid">{(['suicidal_ideation','intent','plan','self_harm','attempt_history','harm_to_others'] as const).map(key=><label key={key}>{key==='suicidal_ideation'?'Αυτοκτονικός ιδεασμός':key==='intent'?'Πρόθεση':key==='plan'?'Σχέδιο':key==='self_harm'?'Αυτοτραυματισμός':key==='attempt_history'?'Ιστορικό απόπειρας':'Κίνδυνος προς άλλους'}<select value={risk[key]} onChange={e=>setRisk(v=>({...v,[key]:e.target.value}))}>{riskOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>)}<label>Προστατευτικοί παράγοντες<textarea rows={2} value={risk.protective_factors} onChange={e=>setRisk(v=>({...v,protective_factors:e.target.value}))}/></label><label>Κλινική σημείωση<textarea rows={2} value={risk.clinical_note} onChange={e=>setRisk(v=>({...v,clinical_note:e.target.value}))}/></label></div></section>
   <section className="visit-part"><header><h3>Κλινική εκτίμηση</h3></header><div>{assessment.fields.map((field,index)=><div className="visit-assessment-field" key={field.key}><label>{assessmentLabels[field.key]||(field.key.startsWith('differential-')?'Διαφορική διάγνωση':field.label)}<textarea rows={2} value={field.text} onChange={e=>changeAssessment(index,{text:e.target.value})}/></label>{(field.key.startsWith('differential-')||field.key==='diagnosis')&&<><label className="diagnosis-certainty">Βεβαιότητα<select value={field.status||''} onChange={e=>changeAssessment(index,{status:(e.target.value||undefined) as DocumentField['status']})}><option value="">Δεν ορίστηκε</option><option value="under_investigation">Υπό διερεύνηση</option><option value="provisional">Προσωρινή</option><option value="confirmed">Επιβεβαιωμένη</option></select></label><div className="assessment-coding"><div className="visit-code-values">{field.codes?.map(code=><span key={code.code}><strong>{code.code}</strong><button type="button" onClick={()=>changeAssessment(index,{codes:field.codes?.filter(item=>item.code!==code.code)})}>×</button></span>)}</div><details><summary>＋ ICD-10</summary><ICD10Picker showValues={false} value={field.codes||[]} onChange={codes=>changeAssessment(index,{codes})}/></details></div></>}</div>)}</div></section>
   <section className="visit-part"><header><h3>Πλάνο / επανεκτίμηση</h3></header><div className="completed-correction-grid"><label>Θεραπευτικό πλάνο<textarea rows={3} value={narrative.plan} onChange={e=>setNarrative(v=>({...v,plan:e.target.value}))}/></label><label>Επανεκτίμηση<textarea rows={3} value={narrative.review} onChange={e=>setNarrative(v=>({...v,review:e.target.value}))}/></label></div></section>
   <details className="visit-additional"><summary>Πρόσθετη καταγραφή & λειτουργικότητα</summary><div className="completed-correction-grid"><label>Λειτουργικότητα<textarea rows={3} value={narrative.functioning} onChange={e=>setNarrative(v=>({...v,functioning:e.target.value}))}/></label>{session.session_type==='initial_assessment'&&<><label>Συμμόρφωση<textarea rows={3} value={narrative.adherence} onChange={e=>setNarrative(v=>({...v,adherence:e.target.value}))}/></label><label>Παρενέργειες<textarea rows={3} value={narrative.effects} onChange={e=>setNarrative(v=>({...v,effects:e.target.value}))}/></label></>}</div></details>
  </fieldset>

  {editing&&<div className="correction-save-bar"><label>Αιτία διόρθωσης<input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="π.χ. διόρθωση καταχώρησης μετά από επανέλεγχο"/></label><div><button type="button" className="finalize-later" disabled={busy} onClick={reset}><X size={15}/> Ακύρωση</button><button type="button" disabled={busy||!pending||!reason.trim()} onClick={()=>void save()}><Check size={15}/>{busy?'Αποθήκευση…':pending?'Αποθήκευση διόρθωσης ('+pending+')':'Καμία αλλαγή'}</button></div>{error&&<p role="alert" className="save-state error">{error}</p>}</div>}
  {history.length>0&&<details className="correction-audit"><summary>Ιστορικό διορθώσεων · {history.length}</summary>{history.map(item=><article key={item.id}><strong>{formatClinicDateTime(item.created_at)}</strong><span>{item.reason}</span><small>{Object.keys(item.patch).length} πεδία/ενότητες</small></article>)}</details>}
 </section>;
}
