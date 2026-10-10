'use client';
import {useEffect,useRef,useState} from 'react';
import {initialDocument,mseItems,type VisitDocument,type DocumentField} from '@/lib/clinical/visit-document';
import type {DemoSection,PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import {useClinicalDraft} from './useClinicalDraft';
import ICD10Picker from './ICD10Picker';
import MseDomain from './MseDomain';
import AssessmentFieldDictation from './AssessmentFieldDictation';
import assessmentStyles from './AssessmentFieldDictation.module.css';
import {appendAssessmentDictation} from '@/lib/clinical/assessment-dictation';
import type {mseTimeline} from '@/lib/clinical/visit-workspace-state';
import {formatClinicDateTime} from '@/lib/clinic-time';
import {visibleMseField,recordMseField,mseReviewCounts,confirmMseUnchanged} from '@/lib/clinical/mse-review';
const assessmentLabels:Record<string,string>={diagnosis:'Διάγνωση',formulation:'Διατύπωση περίπτωσης',impression:'Κλινική εκτίμηση'};
export default function StructuredVisitEditor({sessionId,kind,existing,followup,baseline,timeline,onSaved,registerFlusher,onDirtyChange,compact=false}:{compact?:boolean;sessionId:string;kind:'mse'|'assessment';existing?:DemoSection;followup:boolean;baseline?:DemoSection|null;timeline?:ReturnType<typeof mseTimeline>;onSaved:()=>Promise<unknown>;registerFlusher:(key:string,f:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void}){
 const [domainsOpen,setDomainsOpen]=useState(false);
 const key='section:'+kind;const [conflict,setConflict]=useState<DemoSection|null|undefined>();
 const originalBaseline=kind==='mse'&&baseline?initialDocument('mse',baseline.content,baseline.document):null;
 const baselineDocument=timeline?{kind:'mse' as const,fields:mseItems.map<DocumentField>(([key,label])=>{const source=timeline.references[key];return source?{...source.field,reference:{session_id:source.sessionId,date:source.date}}:{key,label,text:''}}).concat((originalBaseline?.fields.filter(f=>f.key==='legacy')||[]).map(f=>{const visit=timeline.visits.find(v=>v.sessionId===baseline?.session_id);return visit?{...f,reference:{session_id:visit.sessionId,date:visit.date}}:f}))}:originalBaseline;
 const initialValue=initialDocument(kind,existing?.content,existing?.document);
 const [additionalOpen,setAdditionalOpen]=useState(()=>kind==='assessment'&&initialValue.fields.some(field=>field.key!=='diagnosis'&&field.key!=='impression'&&Boolean(field.text.trim()||field.codes?.length)));
 const mseContainer=useRef<HTMLDivElement>(null);
 const draft=useClinicalDraft<VisitDocument>({storageKey:sessionId+':structured:'+kind,initial:initialValue,version:existing?.version??null,write:async(document,version)=>{const d=await demoPost({action:'save_document',session_id:sessionId,section_key:kind,document,expected_version:version});return {value:d.section.document,version:d.section.version}},onSaved,onDirty:dirty=>onDirtyChange(key,dirty)});
 const currentDraft=useRef(draft);currentDraft.current=draft;
 useEffect(()=>registerFlusher(key,draft.flush),[key,registerFlusher,draft.flush]);
 function change(index:number,field:Partial<DocumentField>){draft.change({...draft.value,fields:draft.value.fields.map((f,i)=>i===index?{...f,...field}:f)})}
 const reviewCounts=mseReviewCounts(draft.value,baselineDocument);
 const assessmentFields=draft.value.fields.map((field,index)=>({field,index}));
 const mainAssessmentFields=assessmentFields.filter(({field})=>field.key==='diagnosis'||field.key==='impression').sort((a,b)=>Number(a.field.key==='impression')-Number(b.field.key==='impression'));
 const additionalAssessmentFields=assessmentFields.filter(({field})=>field.key!=='diagnosis'&&field.key!=='impression');
 const hasAdditionalAssessment=additionalAssessmentFields.some(({field})=>Boolean(field.text.trim()||field.codes?.length));
 useEffect(()=>{if(kind==='assessment'&&hasAdditionalAssessment)setAdditionalOpen(true)},[kind,hasAdditionalAssessment]);
 function renderAssessmentField(field:DocumentField,index:number){
  const diagnosis=field.key==='diagnosis',differential=field.key.startsWith('differential-');
  const label=diagnosis?'Διάγνωση ή διαγνωστική υπόθεση':assessmentLabels[field.key]||(differential?'Διαφορική διάγνωση':field.label);
  const placeholder=diagnosis?'Διάγνωση ή πιθανή διαγνωστική κατεύθυνση…':field.key==='impression'?'Σημερινή κλινική εικόνα, σημαντικά ευρήματα και συμπεράσματα…':field.key==='formulation'?'Παράγοντες που συμβάλλουν στην εικόνα και την πορεία…':differential?'Πιθανές διαγνώσεις, εναλλακτικά ενδεχόμενα και στοιχεία υπέρ ή κατά…':'';
  const inputId=sessionId+'-assessment-'+field.key;
  return <div className="visit-assessment-field" key={field.key}>
   <div className={assessmentStyles.heading}>
    <label htmlFor={inputId}>{label}</label>
    <AssessmentFieldDictation fieldKey={field.key} title={label} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onInsert={text=>{
     const latest=currentDraft.current;
     const next=appendAssessmentDictation(latest.value,field.key,text);
     if(next!==latest.value)latest.change(next);
    }}/>
   </div>
   <textarea id={inputId} rows={2} placeholder={placeholder} value={field.text} onChange={e=>change(index,{text:e.target.value})} onBlur={()=>void draft.flush().catch(()=>{})}/>
   {(diagnosis||differential)&&<label className="diagnosis-certainty">Βεβαιότητα<select value={field.status||''} onChange={e=>change(index,{status:(e.target.value||undefined) as DocumentField['status']})}><option value="">Δεν ορίστηκε</option><option value="under_investigation">Υπό διερεύνηση</option><option value="provisional">Προσωρινή</option><option value="confirmed">Επιβεβαιωμένη</option></select></label>}
   {(diagnosis||differential)&&<div className="assessment-coding"><div className="visit-code-values">{field.codes?.map(c=><span key={c.code} title={c.label}><strong>{c.code}</strong><button type="button" aria-label={'Αφαίρεση '+c.code} onClick={()=>change(index,{codes:field.codes?.filter(x=>x.code!==c.code)})}>×</button></span>)}</div><details><summary>＋ ICD-10</summary><ICD10Picker showValues={false} value={field.codes||[]} onChange={codes=>change(index,{codes})}/></details></div>}
   {differential&&<button type="button" className="assessment-remove" aria-label="Αφαίρεση διαφορικής διάγνωσης" onClick={()=>{if(!field.text.trim()&&!field.codes?.length||window.confirm('Αφαίρεση αυτής της διαφορικής διάγνωσης;'))draft.change({...draft.value,fields:draft.value.fields.filter((_,i)=>i!==index)})}}>×</button>}
  </div>;
 }

 function nextDomain(index:number){
  const current=draft.value.fields[index];const currentDetail=mseContainer.current?.querySelector<HTMLDetailsElement>('[data-mse-domain="'+current.key+'"]');if(currentDetail)currentDetail.open=false;
  const next=draft.value.fields[index+1];
  const detail=next?mseContainer.current?.querySelector<HTMLDetailsElement>('[data-mse-domain="'+next.key+'"]'):null;
  if(detail){detail.open=true;detail.querySelector<HTMLElement>('summary')?.focus();detail.scrollIntoView({block:'nearest',behavior:'smooth'})}
  else mseContainer.current?.closest('.visit-document')?.querySelector<HTMLElement>('[data-visit-part="risk"]')?.scrollIntoView({block:'start',behavior:'smooth'});
 }
 return <div className={'visit-structured '+kind}>
 {kind==='mse'&&followup&&<div className="visit-text-button">{baselineDocument?.fields.some(f=>f.text.trim())&&<button type="button" onClick={()=>draft.change(confirmMseUnchanged(draft.value,baselineDocument))}>Χωρίς σημαντικές μεταβολές — επιβεβαίωση προηγούμενων ευρημάτων</button>}<button type="button" onClick={()=>{if(draft.value.fields.some(f=>f.text.trim())&&!window.confirm('Αντικατάσταση της σημερινής εξέτασης με «Δεν αξιολογήθηκε»;'))return;draft.change({...draft.value,fields:draft.value.fields.map(f=>({...f,text:'Δεν αξιολογήθηκε σήμερα',review:'not_assessed'}))})}}>Δεν αξιολογήθηκε σήμερα</button></div>}
 {kind==='mse'&&followup&&baselineDocument&&<div className="mse-compare-head"><span>Βλέπεις τις προηγούμενες επιλογές. Διατήρησέ τις ή άλλαξέ τις για αυτή την επίσκεψη.</span>{reviewCounts.changed>0&&<strong>{reviewCounts.changed} {reviewCounts.changed===1?'αλλαγή':'αλλαγές'}</strong>}</div>}

 {kind==='mse'?<>{followup&&baselineDocument?.fields.find(f=>f.key==='legacy')?.text.trim()&&!draft.value.fields.some(f=>f.key==='legacy')&&<details className="visit-additional"><summary>Προηγούμενη αφηγηματική καταγραφή MSE</summary><pre style={{whiteSpace:'pre-wrap'}}>{baselineDocument.fields.find(f=>f.key==='legacy')?.text}</pre><button type="button" onClick={()=>draft.change({...draft.value,fields:[...draft.value.fields,{...baselineDocument.fields.find(f=>f.key==='legacy')!,review:'unchanged'}]})}>Διατήρηση της αφηγηματικής καταγραφής σήμερα</button></details>}{compact&&<button type="button" aria-expanded={domainsOpen} onClick={()=>setDomainsOpen(v=>!v)}>Καταγραφή αλλαγής σε ενότητα MSE</button>}<div className="mse-columns" ref={mseContainer} hidden={compact&&!domainsOpen}>{[mseItems.slice(0,6),mseItems.slice(6)].map((items,column)=><div className="mse-column" key={column}>{items.map(([key])=>{const index=draft.value.fields.findIndex(field=>field.key===key);if(index<0)return null;const field=draft.value.fields[index];const previous=baselineDocument?.fields.find(item=>item.key===field.key);const reference=followup?previous:undefined;const display=visibleMseField(field,reference);return <MseDomain key={field.key} field={display} previousField={reference} olderReference={timeline?.references[field.key]?.older} referenceLabel={timeline?.references[field.key]?((timeline.references[field.key].older?'Παλαιότερη καταγραφή':'Προηγούμενη επίσκεψη')+' · '+formatClinicDateTime(timeline.references[field.key].date)+(timeline.references[field.key].older?' · δεν επανελέγχθηκε στην τελευταία επίσκεψη':'')):undefined} pending={Boolean(reference?.text.trim()&&!field.review&&!field.text.trim())} review={field.review} onChange={text=>change(index,recordMseField(field,text,reference))} onKeep={reference?.text.trim()?()=>{change(index,recordMseField(field,reference.text,reference));nextDomain(index)}:undefined} onSkip={()=>{change(index,recordMseField(field,'',reference));nextDomain(index)}} onContinue={()=>nextDomain(index)} onBlur={()=>void draft.flush().catch(()=>{})}/>})}</div>)}</div>{draft.value.fields.map((field,index)=>field.key==='legacy'?<MseDomain key={field.key} field={field} onChange={text=>change(index,{text})} onBlur={()=>void draft.flush().catch(()=>{})}/>:null)}</>:<>
  {mainAssessmentFields.map(({field,index})=>renderAssessmentField(field,index))}
  <details className="visit-assessment-additional" open={additionalOpen} onToggle={event=>setAdditionalOpen(event.currentTarget.open)}>
   <summary>Διαφορική διάγνωση{hasAdditionalAssessment&&<span> · Υπάρχει καταγραφή</span>}</summary>
   <div className="visit-assessment-additional-fields">
    {additionalAssessmentFields.map(({field,index})=>renderAssessmentField(field,index))}
    <button type="button" className="visit-text-button" onClick={()=>draft.change({...draft.value,fields:[...draft.value.fields,{key:'differential-'+crypto.randomUUID(),label:'Differential Diagnosis',text:'',status:'under_investigation',codes:[]}]})}>＋ Διαφορική διάγνωση</button>
   </div>
  </details>
 </>}
 <p role="status" className={draft.error?'save-state error':'visit-save'}>{draft.saving?'Αποθήκευση στο πρόχειρο…':draft.error|| (draft.savedAt?'Το πρόχειρο αποθηκεύτηκε '+draft.savedAt:existing?'Το πρόχειρο αποθηκεύτηκε':'')}</p>
 {draft.error&&<div className="visit-text-button">{draft.hasConflict?<button type="button" onClick={()=>void onSaved().then(b=>{if(b)setConflict((b as PatientBundle).sections.find(s=>s.session_id===sessionId&&s.section_key===kind)||null)}).catch(()=>{})}>Έλεγχος αλλαγών</button>:<button type="button" onClick={()=>void draft.flush().catch(()=>{})}>Δοκιμή αποθήκευσης ξανά</button>}</div>}
 {conflict!==undefined&&<div className="conflict-review"><h4>Αποθηκευμένη έκδοση</h4><pre>{conflict?.content||'Κενή'}</pre><button onClick={()=>{draft.acceptServer(initialDocument(kind,conflict?.content,conflict?.document),conflict?.version??null);setConflict(undefined)}}>Χρήση αποθηκευμένου</button><button onClick={()=>{draft.resolve(draft.value,initialDocument(kind,conflict?.content,conflict?.document),conflict?.version??null);setConflict(undefined)}}>Ρητή αντικατάσταση με τη δική μου</button></div>}
 </div>;
}
