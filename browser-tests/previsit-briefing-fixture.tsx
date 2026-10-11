// Browser-only synthetic composition; never imported by an app route.
import React from 'react';
import {createRoot} from 'react-dom/client';
import ClinicalSummary from '../components/patients/ClinicalSummary';
import {buildClinicalCard} from '../lib/clinical/clinical-card';
import {buildSummaryContext} from '../lib/clinical/summary-context';
import {previsitFixture} from '../tests/fixtures/previsit-briefing';
import '../app/globals.css';
import '../app/clinical-refinement.css';
import '../app/visit-workspace.css';
import '../app/mobile.css';
import '../app/initial-assessment.css';
import '../app/clinical-editor.css';
const scenario=new URLSearchParams(location.search).get('case')||'negative';
const bundle=previsitFixture(scenario),card=buildClinicalCard(bundle,buildSummaryContext(bundle));
const qa={requests:[] as {url:string;method:string}[]};
(window as unknown as {briefQA:typeof qa}).briefQA=qa;
const fetchOriginal=window.fetch;
window.fetch=async(input,init)=>{
 const url=String(input);
 if(url.startsWith('/api/')){
  qa.requests.push({url,method:init?.method||'GET'});
  if(!url.startsWith('/api/clinical/summary'))throw Error('Unexpected API in test: '+url);
  if(scenario==='offline')throw Error('Synthetic network outage');
  return Response.json({card,mode:'canonical',context_hash:'synthetic',reason:scenario==='empty'?'no_completed_visit':null});
 }
 return fetchOriginal(input,init);
};
const noop=()=>{};
createRoot(document.getElementById('root')!).render(<main className="qa-brief-shell"><p className="qa-brief-disclaimer">Συνθετικό παράδειγμα — όχι πραγματικός φάκελος ασθενούς</p><div className="qa-brief-layout"><section className="qa-brief-agenda"><h2>Πρόγραμμα ημέρας</h2><div>10:00 · Συνθετικός Ασθενής · Επανεξέταση</div></section><aside className="qa-brief-panel"><span className="qa-brief-patient">Συνθετικός Ασθενής</span><ClinicalSummary bundle={bundle} compact overview onSessions={noop} onPsychometrics={noop} onMedications={noop} onHistory={noop}/></aside></div></main>);
