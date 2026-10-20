'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useTranslations} from 'next-intl';

import {useEffect,useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import {useClinicalDraft} from './useClinicalDraft';


export default function VisitHistory({bundle,sessionId,reload,registerFlusher,onDirtyChange}:{bundle:PatientBundle;sessionId:string;reload:()=>Promise<unknown>;registerFlusher:(k:string,f:()=>Promise<void>)=>(()=>void);onDirtyChange:(k:string,d:boolean)=>void}){
 const ui=useUiText();

const t=useTranslations();

const fields=[['psychiatric_history',t('history.psychiatric')],['medical_history',t('history.medical')],['previous_treatments',t('history.previousTreatments')],['hospitalizations',t('history.hospitalizations')],['family_history',t('history.family')],['substance_history',t('history.substances')],['social_functioning',t('history.socialFunctioning')],['allergies',t('history.allergies')]] as const;
const questions:Record<(typeof fields)[number][0],string>={psychiatric_history:t('history.psychiatricPrompt'),medical_history:t('history.medicalPrompt'),previous_treatments:t('history.treatmentPrompt'),hospitalizations:t('history.admissionsPrompt'),family_history:t('history.familyPrompt'),substance_history:t('history.substancesPrompt'),social_functioning:t('history.socialPrompt'),allergies:t('history.allergiesPrompt')};

 

 const initialAssessment=bundle.sessions.some(session=>session.id===sessionId&&session.session_type==='initial_assessment');
 const shape=(b:PatientBundle)=>Object.fromEntries(fields.map(([k])=>[k,b.history?.[k]||'']));const [conflict,setConflict]=useState<PatientBundle|null>(null);
 const draft=useClinicalDraft({storageKey:sessionId+':history',initial:shape(bundle),version:bundle.history?.version??0,write:async(history,version)=>{const d=await demoPost({action:'save_history',patient_id:bundle.patient.id,history,expected_version:version});return {value:Object.fromEntries(fields.map(([k])=>[k,d.history[k]||''])),version:d.history.version}},onSaved:reload,onDirty:d=>onDirtyChange('history',d)});
 useEffect(()=>registerFlusher('history',draft.flush),[registerFlusher,draft.flush]);
 return <div className="visit-history-shell"><div className="visit-history-intro"><strong>{initialAssessment?t('history.clinicianHistory'):t('history.patientHistory')}</strong><span>{initialAssessment?t('history.clinicianNotesHelp'):t('history.longitudinalAutosaveHelp')}</span></div><div className="visit-history-scroll">{fields.map(([key,label])=><label className="history-question" key={key}><strong>{ui(label)}</strong><span className="history-prompt">{questions[key]}</span><textarea rows={2} value={draft.value[key]} onChange={e=>draft.change({...draft.value,[key]:e.target.value})} onBlur={()=>void draft.flush().catch(()=>{})} placeholder={initialAssessment?t('history.unrecordedPlaceholder'):t('history.interviewPlaceholder')}/></label>)}</div><p role="status">{draft.saving?t('history.saving'):draft.error|| (draft.savedAt?t('common.savedPrefix')+draft.savedAt:'')}</p>{draft.error&&<><button onClick={()=>void draft.flush().catch(()=>{})}>{t('common.repeat')}</button><button onClick={()=>void reload().then(b=>setConflict(b as PatientBundle))}>{t('history.compare')}</button></>}{conflict&&<div className="conflict-review"><pre>{JSON.stringify(shape(conflict),null,2)}</pre><button onClick={()=>{draft.acceptServer(shape(conflict),conflict.history?.version??0);setConflict(null)}}>{t('visits.useSaved')}</button><button onClick={()=>{draft.resolve(draft.value,shape(conflict),conflict.history?.version??0);setConflict(null)}}>{t('visits.explicitReplace')}</button></div>}</div>;
}
