'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useTranslations} from 'next-intl';
import {useLocale} from 'next-intl';
import {useSystemMessage} from '@/i18n/system-message';
import PatientVisualIcon from './PatientVisualIcon';
import {useEffect,useMemo,useRef,useState} from 'react';
import {X,Check} from 'lucide-react';
import type {DemoRisk,DemoSession,PatientBundle} from '@/lib/patients/demo-runtime';
import type {VisitDocument,DocumentField} from '@/lib/clinical/visit-document';
import {initialDocument,mseItems} from '@/lib/clinical/visit-document';
import {effectiveDocument,effectiveRisk,effectiveText,correctionsFor} from '@/lib/clinical/corrections';
import {demoPost} from '@/lib/patients/demo-client';
import {formatClinicDateTime} from '@/lib/clinic-time';
import RiskAssessmentRead from './RiskAssessmentRead';
import {riskTreePath,riskTreeQuestions} from '@/lib/clinical/risk-tree';
import MseDomain from './MseDomain';
import ICD10Picker from './ICD10Picker';

const narrativeKeys=['interview','adherence','effects','functioning','plan','review'] as const;


function riskShape(r?:DemoRisk){return {suicidal_ideation:r?.suicidal_ideation||'not_assessed',intent:r?.intent||'not_assessed',plan:r?.plan||'not_assessed',self_harm:r?.self_harm||'not_assessed',attempt_history:r?.attempt_history||'not_assessed',harm_to_others:r?.harm_to_others||'not_assessed',protective_factors:r?.protective_factors||'',clinical_note:r?.clinical_note||'',tree:r?.tree};}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

export default function CompletedRecordEditor({session,bundle,reload,onBack,registerFlusher,onDirtyChange}:{session:DemoSession;bundle:PatientBundle;reload:()=>Promise<unknown>;onBack:()=>void;registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void}){
 const ui=useUiText();

 const systemMessage=useSystemMessage();

const t=useTranslations();

 const locale=useLocale();

const assessmentLabels:Record<string,string>={diagnosis:t('clinical.diagnosis'),formulation:t('clinical.caseFormulation'),impression:t('clinical.assessment')};
const riskOptions=[['not_assessed',t('clinical.notAssessed')],['unknown',t('common.unknown')],['negative',t('clinical.negative')],['positive',t('clinical.positive')]] as const;

 

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
 const [editedMse,setMse]=useState<VisitDocument>(baseMse),[editedAssessment,setAssessment]=useState<VisitDocument>(baseAssessment),[editedRisk,setRisk]=useState(baseRisk),[editedNarrative,setNarrative]=useState(baseNarrative);
 const baseline=useRef({mse:baseMse,assessment:baseAssessment,risk:baseRisk,narrative:baseNarrative,count:0});
 // Viewing always follows canonical data. Editing starts from one frozen version.
 const mse=editing?editedMse:baseMse,assessment=editing?editedAssessment:baseAssessment,risk=editing?editedRisk:baseRisk,narrative=editing?editedNarrative:baseNarrative;
 const ready=session.status==='completed'&&session.patient_id===bundle.patient.id;
 function beginEditing(){
  if(!ready)return;
  baseline.current={mse:baseMse,assessment:baseAssessment,risk:baseRisk,narrative:baseNarrative,count:correctionsFor(corrections,session.id).length};
  setMse(baseMse);setAssessment(baseAssessment);setRisk(baseRisk);setNarrative(baseNarrative);setReason('');setError('');correctionRequest.current=crypto.randomUUID();setEditing(true);
 }

 function reset(){setMse(baseMse);setAssessment(baseAssessment);setRisk(baseRisk);setNarrative(baseNarrative);setReason('');setError('');setEditing(false);correctionRequest.current=null}
 function changeMse(index:number,text:string){setMse(current=>({...current,fields:current.fields.map((field,i)=>i===index?{...field,text,review:text.trim()?'changed':'not_assessed'}:field)}))}
 function changeAssessment(index:number,change:Partial<DocumentField>){setAssessment(current=>({...current,fields:current.fields.map((field,i)=>i===index?{...field,...change}:field)}))}
 function changeRisk(key:'suicidal_ideation'|'intent'|'plan'|'self_harm'|'attempt_history'|'harm_to_others',value:string){
  setRisk(current=>{
   const answerKey:keyof NonNullable<typeof current.tree>['answers']|null=key==='suicidal_ideation'?'wish':key==='harm_to_others'?'others':key==='intent'?'intent':key==='plan'?'plan':null;
   return {...current,[key]:value,...(answerKey&&current.tree?{tree:{...current.tree,answers:{...current.tree.answers,[answerKey]:value}}}:{})};
  });
 }
 function makePatch(){
  const value:Record<string,{before:unknown;after:unknown}>={};
  if(!editing)return value;
  const base=baseline.current;
  for(const key of narrativeKeys)if(!same(base.narrative[key],narrative[key]))value[key]={before:base.narrative[key],after:narrative[key]};
  if(!same(base.mse,mse))value.mse={before:base.mse,after:mse};
  if(!same(base.assessment,assessment))value.assessment={before:base.assessment,after:assessment};
  if(!same(base.risk,risk))value.risk={before:base.risk,after:risk};
  return value;
 }
 const pending=Object.keys(makePatch()).length;
 const history=correctionsFor(corrections,session.id);
 const correctionDirty=editing&&(pending>0||Boolean(reason.trim()));
 const correctionKey='completed-correction:'+session.id;
 useEffect(()=>{onDirtyChange(correctionKey,correctionDirty);return()=>onDirtyChange(correctionKey,false)},[correctionKey,correctionDirty,onDirtyChange]);
 useEffect(()=>registerFlusher(correctionKey,async()=>{if(correctionDirty)throw new Error(t('visits.saveOrCancelCorrection'))}),[correctionKey,correctionDirty,registerFlusher]);
 async function save(){
  if(!pending||!reason.trim()||busy)return;
  if(history.length!==baseline.current.count){setError(t('visits.concurrentCorrection'));return}
  setBusy(true);setError('');
  const requestId=correctionRequest.current||(correctionRequest.current=crypto.randomUUID());
  try{await demoPost({action:'correct_session',session_id:session.id,request_id:requestId,reason:reason.trim(),patch:makePatch(),expected_count:baseline.current.count});await reload();setEditing(false);setReason('');correctionRequest.current=null}
  catch(e){setError(e instanceof Error?e.message:t('errors.correctionSave'))}
  finally{setBusy(false)}
 }
 return <section data-completed-record data-reading={!editing} className="session-workspace completed-session-view corrected-record-view">
  <div className="session-work-head">
   <div><button className="session-back-button" onClick={()=>{if(correctionDirty){setError(t('visits.saveOrCancelCorrection'));return}onBack()}}>{t('visits.backToVisits')}</button><span className="visit-label completed"><span>{t('visits.finalizedKicker')}</span><i/> {session.session_type==='initial_assessment'?t('visits.initialAssessmentKicker'):t('visits.followupKicker')}</span><h2>{session.session_type==='initial_assessment'?t('visits.initialAssessment'):t('visits.followup')}</h2><p>{t('visits.correctionHistoryHelp')}</p></div>
   <div className="completed-record-actions"><span className="draft-updated">{t('visits.completedPrefix')} {formatClinicDateTime(session.completed_at||session.started_at,locale)}</span>{!editing&&<button type="button" disabled={!ready} onClick={beginEditing}>{ready?t('visits.correctRecord'):t('visits.loadingRecord')}</button>}</div>
  </div>

  <fieldset disabled={!editing||busy} className="visit-document completed-record-form">
   <section className="visit-part"><header><h3><PatientVisualIcon name="notes"/>{session.session_type==='follow_up'?t('clinical.symptomsCourse'):t('clinical.presentingComplaintCurrentState')}</h3></header><div><textarea rows={4} value={narrative.interview} onChange={e=>setNarrative(v=>({...v,interview:e.target.value}))}/></div></section>
   {session.session_type==='follow_up'&&<section className="visit-part"><header><h3><PatientVisualIcon name="medication"/>{t('medications.effectsAndAdherence')}</h3></header><div className="completed-correction-grid"><label>{t('medications.adherence')}<textarea rows={3} value={narrative.adherence} onChange={e=>setNarrative(v=>({...v,adherence:e.target.value}))}/></label><label>{t('medications.sideEffects')}<textarea rows={3} value={narrative.effects} onChange={e=>setNarrative(v=>({...v,effects:e.target.value}))}/></label></div></section>}
   <section className="visit-part"><header><h3><PatientVisualIcon name="mse"/>MSE</h3></header><div className="mse-columns">{[mseItems.slice(0,6),mseItems.slice(6)].map((items,column)=><div className="mse-column" key={column}>{items.map(([key])=>{const index=mse.fields.findIndex(field=>field.key===key);if(index<0)return null;return <MseDomain key={key} field={mse.fields[index]} onChange={text=>changeMse(index,text)} onBlur={()=>{}}/>})}</div>)}</div>{mse.fields.map((field,index)=>field.key==='legacy'?<MseDomain key="legacy" field={field} onChange={text=>changeMse(index,text)} onBlur={()=>{}}/>:null)}</section>
   <section className="visit-part"><header><h3><PatientVisualIcon name="risk"/>{t('clinical.riskAssessment')}</h3></header><div className="completed-correction-grid">{!editing&&<RiskAssessmentRead risk={risk}/>}<div hidden={!editing}>{risk.tree&&riskTreePath(risk.tree.answers).filter(key=>!['wish','intent','plan'].includes(key)).map(key=><label key={key}>{riskTreeQuestions[key].title}<select value={risk.tree!.answers[key]||'not_assessed'} onChange={e=>setRisk(v=>({...v,...(key==='selfacted'?{self_harm:e.target.value}:{}),tree:{...v.tree!,answers:{...v.tree!.answers,[key]:e.target.value}}}))}>{riskTreeQuestions[key].choices.map(([value,label])=><option key={value} value={value}>{ui(label)}</option>)}</select></label>)}{(['suicidal_ideation','intent','plan','self_harm','attempt_history','harm_to_others'] as const).filter(key=>!(key==='self_harm'&&risk.tree&&riskTreePath(risk.tree.answers).some(k=>k==='selfacted'))).map(key=><label key={key}>{key==='suicidal_ideation'?t('clinical.suicidalIdeation'):key==='intent'?t('clinical.intent'):key==='plan'?t('clinical.plan'):key==='self_harm'?t('clinical.selfHarm'):key==='attempt_history'?t('clinical.attemptHistory'):t('clinical.harmToOthers')}<select value={risk[key]} onChange={e=>changeRisk(key,e.target.value)}>{riskOptions.map(([value,label])=><option key={value} value={value}>{ui(label)}</option>)}</select></label>)}<label>{t('clinical.protectiveFactors')}<textarea rows={2} value={risk.protective_factors} onChange={e=>setRisk(v=>({...v,protective_factors:e.target.value}))}/></label><label>{t('clinical.clinicalNote')}<textarea rows={2} value={risk.clinical_note} onChange={e=>setRisk(v=>({...v,clinical_note:e.target.value}))}/></label></div></div></section>
   <section className="visit-part"><header><h3><PatientVisualIcon name="assessment"/>{t('clinical.assessment')}</h3></header><div>{assessment.fields.map((field,index)=><div className="visit-assessment-field" key={field.key}><label>{assessmentLabels[field.key]||(field.key.startsWith('differential-')?t('clinical.differentialDiagnosis'):field.label)}<textarea rows={2} value={field.text} onChange={e=>changeAssessment(index,{text:e.target.value})}/></label>{(field.key.startsWith('differential-')||field.key==='diagnosis')&&<><label className="diagnosis-certainty">{t('clinical.certainty')}<select value={field.status||''} onChange={e=>changeAssessment(index,{status:(e.target.value||undefined) as DocumentField['status']})}><option value="">{t('clinical.unspecified')}</option><option value="under_investigation">{t('clinical.underInvestigation')}</option><option value="provisional">{t('clinical.provisional')}</option><option value="confirmed">{t('clinical.confirmed')}</option></select></label><div className="assessment-coding"><div className="visit-code-values">{field.codes?.map(code=><span key={code.code}><strong>{code.code}</strong><button type="button" onClick={()=>changeAssessment(index,{codes:field.codes?.filter(item=>item.code!==code.code)})}>×</button></span>)}</div><details><summary>＋ ICD-10</summary><ICD10Picker showValues={false} value={field.codes||[]} onChange={codes=>changeAssessment(index,{codes})}/></details></div></>}</div>)}</div></section>
   <section className="visit-part"><header><h3><PatientVisualIcon name="plan"/>{t('clinical.planReview')}</h3></header><div className="completed-correction-grid"><label>{t('clinical.treatmentPlan')}<textarea rows={3} value={narrative.plan} onChange={e=>setNarrative(v=>({...v,plan:e.target.value}))}/></label><label>{t('clinical.review')}<textarea rows={3} value={narrative.review} onChange={e=>setNarrative(v=>({...v,review:e.target.value}))}/></label></div></section>
   <details className="visit-additional"><summary>{t('clinical.additionalNotesFunctioning')}</summary><div className="completed-correction-grid"><label>{t('clinical.functioning')}<textarea rows={3} value={narrative.functioning} onChange={e=>setNarrative(v=>({...v,functioning:e.target.value}))}/></label>{session.session_type==='initial_assessment'&&<><label>{t('medications.adherence')}<textarea rows={3} value={narrative.adherence} onChange={e=>setNarrative(v=>({...v,adherence:e.target.value}))}/></label><label>{t('medications.sideEffects')}<textarea rows={3} value={narrative.effects} onChange={e=>setNarrative(v=>({...v,effects:e.target.value}))}/></label></>}</div></details>
  </fieldset>

  {editing&&<div className="correction-save-bar"><label>{t('visits.correctionReason')}<input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder={t('visits.correctionReasonPlaceholder')}/></label><div><button type="button" className="finalize-later" disabled={busy} onClick={reset}><X size={15}/>  {t('common.cancel')}</button><button type="button" disabled={busy||!pending||!reason.trim()} onClick={()=>void save()}><Check size={15}/>{busy?t('common.saving'):pending?t('visits.saveCorrectionPrefix')+pending+')':t('common.noChanges')}</button></div>{error&&<p role="alert" className="save-state error">{systemMessage(error)}</p>}</div>}
  {history.length>0&&<details className="correction-audit"><summary>{t('visits.correctionHistoryPrefix')} {history.length}</summary>{history.map(item=><article key={item.id}><strong>{formatClinicDateTime(item.created_at,locale)}</strong><span>{item.reason}</span><small>{Object.keys(item.patch).length}  {t('visits.fieldsSectionsSuffix')}</small></article>)}</details>}
 </section>;
}
