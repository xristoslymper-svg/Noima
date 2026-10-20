'use client';
import {useTranslations} from 'next-intl';
import {useState} from 'react';
import PatientReportedHistory from './PatientReportedHistory';
import {SyntheticChartContext,SyntheticHistoryPreviewContext} from './SyntheticChartContext';
import type {ReceivedHistory} from '@/lib/intake/patient-report';

const records:ReceivedHistory[]=[{
 id:'synthetic-history-preview',status:'submitted',tools:['history'],channel:'tablet',submitted_at:'2026-10-18T09:00:00Z',
 history_answers:{reasons:['Άγχος','Δυσκολία στον ύπνο'],duration:'gt1y',current_meds:'yes',current_medication_name:'ΣΥΝΘΕΤΙΚΗ ΑΓΩΓΗ — παράδειγμα μόνο',suicide_attempt:'yes',self_harm:'yes'}
}];
export default function ReceivedHistoryPreview(){
 const t=useTranslations();

 const [tab,setTab]=useState<'summary'|'history'>('summary');
 const [mode,setMode]=useState<'ok'|'failed'|'stale'>('ok');
 return <SyntheticChartContext.Provider value={true}>
 <SyntheticHistoryPreviewContext.Provider value={{records:mode==='failed'?[]:records,unavailable:mode!=='ok',onRetry:()=>setMode('ok')}}>
 <main className="clinical-page" style={{maxWidth:1040,margin:'0 auto',padding:'32px 24px'}}>
 <p className="kicker">{t('current.m122')}</p>
 <h1>Άννα Παραδείγματος</h1>
 <p>{t('current.m124')}</p>
 <nav aria-label={t('current.m130')} style={{display:'flex',gap:16,margin:'24px 0'}}>
 <button type="button" className="patient-reported-link" aria-pressed={tab==='summary'} onClick={()=>setTab('summary')}>{t('clinical.summary')}</button>
 <button type="button" className="patient-reported-link" aria-pressed={tab==='history'} onClick={()=>setTab('history')}>{t('patients.detailsHistory')}</button>
 </nav>
 <PatientReportedHistory key={tab} patientId="synthetic-history-preview" compact={tab==='summary'} onOpen={()=>setTab('history')}/>
 <details style={{marginTop:32}}><summary>{t('current.m125')}</summary>
 <p>{t('current.m126')}</p>
 <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
 <button type="button" onClick={()=>setMode('ok')}>{t('current.m127')}</button>
 <button type="button" onClick={()=>setMode('failed')}>{t('current.m128')}</button>
 <button type="button" onClick={()=>setMode('stale')}>{t('current.m129')}</button>
 </div></details>
 </main></SyntheticHistoryPreviewContext.Provider></SyntheticChartContext.Provider>;
}
