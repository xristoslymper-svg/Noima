'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useLocale} from 'next-intl';

import {useTranslations} from 'next-intl';

import {useEffect,useRef,useState} from 'react';
import {firstAssessmentDocument,initialDocument,mseItems,type VisitDocument,type DocumentField} from '@/lib/clinical/visit-document';
import type {DemoSection,PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import {draftSaveStatus} from '@/lib/clinical/draft-save-status';
import {useClinicalDraft} from './useClinicalDraft';
import ICD10Picker from './ICD10Picker';
import MseDomain from './MseDomain';
import ClinicalTextField from '@/components/dictation/ClinicalTextField';
import type {mseTimeline} from '@/lib/clinical/visit-workspace-state';
import {formatClinicDateTime} from '@/lib/clinic-time';
import {visibleMseField,recordMseField,mseReviewCounts,confirmMseUnchanged} from '@/lib/clinical/mse-review';
const assessmentLabels:Record<string,string>={diagnosis:'Διάγνωση',formulation:'Κλινικές σημειώσεις',impression:'Κλινική εκτίμηση'};
export default function StructuredVisitEditor({sessionId,kind,existing,followup,baseline,timeline,onSaved,registerFlusher,onDirtyChange,compact=false,firstAssessment=false,saveDocument}:{saveDocument?:(document:VisitDocument,version:number|null)=>Promise<{value:VisitDocument;version:number}>;firstAssessment?:boolean;compact?:boolean;sessionId:string;kind:'mse'|'assessment';existing?:DemoSection;followup:boolean;baseline?:DemoSection|null;timeline?:ReturnType<typeof mseTimeline>;onSaved:()=>Promise<unknown>;registerFlusher:(key:string,f:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void}){
 const ui=useUiText();

 const locale=useLocale();
 const t=useTranslations();

 const [domainsOpen,setDomainsOpen]=useState(false);
 const [writingFields,setWritingFields]=useState<Record<string,boolean>>({});
 const key='section:'+kind;const [conflict,setConflict]=useState<DemoSection|null|undefined>();
 const originalBaseline=kind==='mse'&&baseline?initialDocument('mse',baseline.content,baseline.document):null;
 const baselineDocument=timeline?{kind:'mse' as const,fields:mseItems.map<DocumentField>(([key,label])=>{const source=timeline.references[key];return source?{...source.field,reference:{session_id:source.sessionId,date:source.date}}:{key,label,text:''}}).concat((originalBaseline?.fields.filter(f=>f.key==='legacy')||[]).map(f=>{const visit=timeline.visits.find(v=>v.sessionId===baseline?.session_id);return visit?{...f,reference:{session_id:visit.sessionId,date:visit.date}}:f}))}:originalBaseline;
 const initialValue=firstAssessment&&kind==='assessment'?firstAssessmentDocument(existing?.content,existing?.document):initialDocument(kind,existing?.content,existing?.document);
 const [additionalOpen,setAdditionalOpen]=useState(()=>kind==='assessment'&&initialValue.fields.some(field=>field.key!=='diagnosis'&&field.key!=='impression'&&field.key!=='formulation'&&Boolean(field.text.trim()||field.codes?.length)));
 const mseContainer=useRef<HTMLDivElement>(null);
 const draft=useClinicalDraft<VisitDocument>({storageKey:sessionId+':structured:'+kind,initial:initialValue,version:existing?.version??null,write:async(document,version)=>{if(saveDocument)return saveDocument(document,version);const d=await demoPost({action:'save_document',session_id:sessionId,section_key:kind,document,expected_version:version});return {value:d.section.document,version:d.section.version}},onSaved,onDirty:dirty=>onDirtyChange(key,dirty)});
 const currentDraft=useRef(draft);currentDraft.current=draft;
 useEffect(()=>registerFlusher(key,draft.flush),[key,registerFlusher,draft.flush]);
 function change(index:number,field:Partial<DocumentField>){const value=currentDraft.current.currentValue();draft.change({...value,fields:value.fields.map((f,i)=>i===index?{...f,...field}:f)})}
 const reviewCounts=mseReviewCounts(draft.value,baselineDocument);
 const mseFields=[...mseItems.map(([key])=>draft.value.fields.findIndex(field=>field.key===key)).filter(index=>index>=0),...draft.value.fields.map((field,index)=>({field,index})).filter(({field})=>!mseItems.some(([key])=>key===field.key)).map(({index})=>index)].map(index=>({field:draft.value.fields[index],index}));
 const assessmentFields=draft.value.fields.map((field,index)=>({field,index}));
 const mainAssessmentFields=assessmentFields.filter(({field})=>field.key==='diagnosis'||field.key==='impression').sort((a,b)=>Number(a.field.key==='impression')-Number(b.field.key==='impression'));
 const additionalAssessmentFields=assessmentFields.filter(({field})=>field.key!=='diagnosis'&&field.key!=='impression'&&field.key!=='formulation');
 // Retain legacy formulation without adding a second differential-diagnosis field.
 const legacyAssessmentFields=assessmentFields.filter(({field})=>(field.key==='formulation'||firstAssessment&&!['diagnosis','impression'].includes(field.key)&&!field.key.startsWith('differential-'))&&Boolean(field.text.trim()||field.codes?.length));
 const hasAdditionalAssessment=additionalAssessmentFields.some(({field})=>Boolean(field.text.trim()||field.codes?.length));
 useEffect(()=>{if(kind==='assessment'&&hasAdditionalAssessment)setAdditionalOpen(true)},[kind,hasAdditionalAssessment]);
 function renderAssessmentField(field:DocumentField,index:number){
  const diagnosis=field.key==='diagnosis',differential=field.key.startsWith('differential-');
  const label=diagnosis?t('clinical.diagnosticHypothesis'):assessmentLabels[field.key]||(differential?t('clinical.differentialDiagnosis'):field.label);
  const placeholder=diagnosis?t('clinical.diagnosisPlaceholder'):field.key==='impression'?(firstAssessment?t('clinical.assessmentPlaceholder'):t('clinical.todayAssessmentPlaceholder')):field.key==='formulation'?t('clinical.formulationPlaceholder'):differential?t('clinical.differentialPlaceholder'):'';
  return <div className="visit-assessment-field" key={field.key}>
   <ClinicalTextField sessionId={sessionId} section="assessment" fieldKey={field.key} title={ui(label)} placeholder={placeholder} value={field.text} onChange={text=>change(index,{text})} onBlur={()=>void draft.flush().catch(()=>{})} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} onPendingChange={pending=>setWritingFields(v=>v[field.key]===pending?v:{...v,[field.key]:pending})} onConfirm={async(text,{provenance})=>{
    await currentDraft.current.flush();const latest=currentDraft.current;
    const value=latest.currentValue();const target=value.fields.find(f=>f.key===field.key);if(!target||target.text!==provenance.original)throw new Error(t('errors.fieldChanged'));
    latest.change({...value,fields:value.fields.map(f=>f.key===field.key?{...f,text,writing_provenance:provenance}:f)});
    // Explicit confirmation has transferred the value to the recoverable draft.
    // Draft errors remain visible and block navigation through its own flusher.
    await latest.flush().catch(()=>{});
   }}/>
   {!firstAssessment&&(diagnosis||differential)&&<label className="diagnosis-certainty">{t('clinical.certainty')}<select value={field.status||''} onChange={e=>change(index,{status:(e.target.value||undefined) as DocumentField['status']})}><option value="">{t('clinical.unspecified')}</option><option value="under_investigation">{t('clinical.underInvestigation')}</option><option value="provisional">{t('clinical.provisional')}</option><option value="confirmed">{t('clinical.confirmed')}</option></select></label>}
   {(diagnosis||differential)&&<div className="assessment-coding"><div className="visit-code-values">{field.codes?.map(c=><span key={c.code} title={c.label}><strong>{c.code}</strong><button type="button" aria-label={t('common.removePrefix')+c.code} onClick={()=>change(index,{codes:field.codes?.filter(x=>x.code!==c.code)})}>×</button></span>)}</div><details><summary>＋ ICD-10</summary><ICD10Picker showValues={false} value={field.codes||[]} onChange={codes=>change(index,{codes})}/></details></div>}
   {differential&&(!firstAssessment||additionalAssessmentFields.filter(({field})=>field.key.startsWith('differential-')).length>1)&&<button type="button" disabled={writingFields[field.key]} className="assessment-remove" aria-label={t('clinical.removeDifferential')} onClick={()=>{if(!field.text.trim()&&!field.codes?.length||window.confirm(t('clinical.confirmRemoveDifferential')))draft.change({...draft.value,fields:draft.value.fields.filter((_,i)=>i!==index)})}}>×</button>}
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
 {kind==='mse'&&followup&&baselineDocument?.fields.some(f=>f.text.trim())&&<div className="visit-text-button">{baselineDocument?.fields.some(f=>f.text.trim())&&<button type="button" onClick={()=>draft.change(confirmMseUnchanged(draft.value,baselineDocument))}>{t('clinical.confirmPreviousMse')}</button>}</div>}
 {kind==='mse'&&followup&&baselineDocument&&<div className="mse-compare-head"><span>{t('clinical.previousMseChoicesHelp')}</span>{reviewCounts.changed>0&&<strong>{reviewCounts.changed} {reviewCounts.changed===1?t('common.changeSingular'):t('common.changesPlural')}</strong>}</div>}

 {kind==='mse'?<>{followup&&baselineDocument?.fields.find(f=>f.key==='legacy')?.text.trim()&&!draft.value.fields.some(f=>f.key==='legacy')&&<details className="visit-additional"><summary>{t('clinical.previousNarrativeMse')}</summary><pre style={{whiteSpace:'pre-wrap'}}>{baselineDocument.fields.find(f=>f.key==='legacy')?.text}</pre><button type="button" onClick={()=>draft.change({...draft.value,fields:[...draft.value.fields,{...baselineDocument.fields.find(f=>f.key==='legacy')!,review:'unchanged'}]})}>{t('clinical.keepNarrativeMse')}</button></details>}{compact&&<button type="button" aria-expanded={domainsOpen} onClick={()=>setDomainsOpen(v=>!v)}>{t('clinical.recordMseChange')}</button>}<div className="mse-columns" ref={mseContainer} hidden={compact&&!domainsOpen}>{mseFields.map(({field,index})=>{const standard=mseItems.some(([key])=>key===field.key);const previous=baselineDocument?.fields.find(item=>item.key===field.key);const reference=followup&&standard?previous:undefined;const display=visibleMseField(field,reference);return <MseDomain key={field.key} field={display} previousField={reference} olderReference={timeline?.references[field.key]?.older} referenceLabel={timeline?.references[field.key]?((timeline.references[field.key].older?t('clinical.earlierEntry'):t('visits.previousVisit'))+' · '+formatClinicDateTime(timeline.references[field.key].date,locale)+(timeline.references[field.key].older?t('clinical.notReviewedLastVisit'):'')):undefined} pending={Boolean(reference?.text.trim()&&!field.review&&!field.text.trim())} review={field.review} onChange={text=>change(index,standard?recordMseField(field,text,reference):{text})} onKeep={reference?.text.trim()?()=>{change(index,recordMseField(field,reference.text,reference));nextDomain(index)}:undefined} onSkip={standard?()=>{change(index,recordMseField(field,'',reference));nextDomain(index)}:undefined} onContinue={standard?()=>nextDomain(index):undefined} onBlur={()=>void draft.flush().catch(()=>{})}/>})}</div></>:<>
  {firstAssessment?<>
   <section data-visit-part="assessment" className="first-assessment-impression"><h3>{t('clinical.assessment')}</h3>{assessmentFields.filter(({field})=>field.key==='impression').map(({field,index})=>renderAssessmentField(field,index))}</section>
   <section data-visit-part="diagnosis" className="first-assessment-diagnosis"><h3>{t('clinical.diagnosisDifferential')}</h3>{assessmentFields.filter(({field})=>field.key==='diagnosis').map(({field,index})=><div key={field.key}><ICD10Picker value={field.codes||[]} onChange={codes=>change(index,{codes})}/>{(field.text.trim()||field.status)&&<details className="assessment-legacy-notes"><summary>{t('clinical.previousDiagnosisCertainty')}</summary><p style={{whiteSpace:'pre-wrap'}}>{field.text}</p>{field.status&&<p>{t('clinical.certaintyPrefix')} {field.status==='confirmed'?t('documents.printConfirmed'):field.status==='provisional'?t('clinical.provisional'):t('clinical.underInvestigation')}</p>}</details>}</div>)}<div className="first-assessment-differential">{additionalAssessmentFields.filter(({field})=>field.key.startsWith('differential-')).map(({field,index})=>renderAssessmentField(field,index))}</div></section>
  </>:mainAssessmentFields.map(({field,index})=>renderAssessmentField(field,index))}
  {!firstAssessment&&<details className="visit-assessment-additional" open={additionalOpen} onToggle={event=>setAdditionalOpen(event.currentTarget.open)}>
   <summary>{t('clinical.differentialDiagnosis')}{hasAdditionalAssessment&&<span>  {t('clinical.hasRecordSuffix')}</span>}</summary>
   <div className="visit-assessment-additional-fields">
    {additionalAssessmentFields.map(({field,index})=>firstAssessment?<div key={field.key}>{firstAssessment&&!field.key.startsWith('differential')?<p style={{whiteSpace:'pre-wrap'}}>{field.text}</p>:renderAssessmentField(field,index)}{firstAssessment&&field.status&&<small>{t('clinical.recordedCertaintyPrefix')} {field.status==='confirmed'?t('documents.printConfirmed'):field.status==='provisional'?t('clinical.provisional'):t('clinical.underInvestigation')}</small>}</div>:renderAssessmentField(field,index))}
    <button type="button" className="visit-text-button" onClick={()=>draft.change({...draft.value,fields:[...draft.value.fields,{key:'differential-'+crypto.randomUUID(),label:'Differential Diagnosis',text:'',...(firstAssessment?{}:{status:'under_investigation' as const}),codes:[]}]})}>{t('clinical.addDifferential')}</button>
   </div>
  </details>}
  {legacyAssessmentFields.length>0&&<details className="assessment-legacy-notes"><summary>{t('clinical.previousClinicalNotes')}</summary>{legacyAssessmentFields.map(({field,index})=>firstAssessment?<p key={field.key} style={{whiteSpace:'pre-wrap'}}>{field.text}</p>:renderAssessmentField(field,index))}</details>}
 </>}
 <p role="status" className={draft.error?'save-state error':'visit-save'}>{draftSaveStatus({saving:draft.saving,dirty:draft.dirty,error:draft.error,savedAt:draft.savedAt,recorded:Boolean(existing||draft.savedAt)},ui)}</p>
 {draft.error&&<div className="visit-text-button">{draft.hasConflict?<button type="button" onClick={()=>void onSaved().then(b=>{if(b)setConflict((b as PatientBundle).sections.find(s=>s.session_id===sessionId&&s.section_key===kind)||null)}).catch(()=>{})}>{t('visits.reviewChanges')}</button>:<button type="button" onClick={()=>void draft.flush().catch(()=>{})}>{t('visits.trySavingAgain')}</button>}</div>}
 {conflict!==undefined&&<div className="conflict-review"><h4>{t('visits.savedVersion')}</h4><pre>{conflict?.content||t('common.empty')}</pre><button onClick={()=>{draft.acceptServer((firstAssessment&&kind==='assessment'?firstAssessmentDocument(conflict?.content,conflict?.document):initialDocument(kind,conflict?.content,conflict?.document)),conflict?.version??null);setConflict(undefined)}}>{t('visits.useSaved')}</button><button onClick={()=>{draft.resolve(draft.value,initialDocument(kind,conflict?.content,conflict?.document),conflict?.version??null);setConflict(undefined)}}>{t('visits.replaceWithMine')}</button></div>}
 </div>;
}
