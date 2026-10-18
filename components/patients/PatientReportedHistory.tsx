'use client';
import {useSyntheticChart,useSyntheticHistoryPreview} from './SyntheticChartContext';
import {useEffect,useState} from 'react';
import {getDemoTesterId} from '@/lib/demo-tester';
import {historyDraftFromAnswers} from '@/lib/intake/history';
import {normalizedPatientHistory,patientReportedHighlights,receivedPatientHistories,type ReceivedHistory} from '@/lib/intake/patient-report';

const fields=[['psychiatric_history','Ψυχιατρικό ιστορικό'],['medical_history','Σωματικό ιστορικό'],['previous_treatments','Θεραπείες και φάρμακα'],['hospitalizations','Νοσηλείες'],['family_history','Οικογενειακό ιστορικό'],['substance_history','Ουσίες'],['social_functioning','Κοινωνικό ιστορικό'],['allergies','Αλλεργίες']] as const;
const dateLabel=(value:string|null)=>value?new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'numeric',month:'short',year:'numeric'}).format(new Date(value)):'';
export default function PatientReportedHistory({patientId,compact=false,onOpen}:{patientId:string;compact?:boolean;onOpen?:()=>void}){
 const synthetic=useSyntheticChart();
 const preview=useSyntheticHistoryPreview();
 const [liveData,setData]=useState<ReceivedHistory[]>([]);
 const [liveLoading,setLoading]=useState(true);
 const [liveError,setError]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(synthetic){setData([]);setLoading(false);setError(false);return;}
  const controller=new AbortController();
  setLoading(true);setError(false);setData([]);
  let inFlight=false;
  let viewed=false;
  const load=async(silent=false)=>{
   if(inFlight||controller.signal.aborted)return;
   inFlight=true;
   try{
    const response=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list',tester:getDemoTesterId(),patient_id:patientId}),signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error('intake_list_failed');
    const result=await response.json();
    const received=receivedPatientHistories((result.intakes||[]) as ReceivedHistory[]);
    if(!controller.signal.aborted){setData(received);setError(false)}
    if(!compact&&received.length&&!viewed&&!controller.signal.aborted){
     // Passive read receipt only. Original self-report and clinician review
     // state are untouched, and no extra confirmation is shown.
     try{
      const seen=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'mark_viewed',tester:getDemoTesterId(),patient_id:patientId}),signal:controller.signal});
      if(seen.ok)viewed=true;
     }catch{/* read receipt is optional; the answers remain accessible */}
    }
   }catch{if(!controller.signal.aborted)setError(true)}
   finally{inFlight=false;if(!controller.signal.aborted&&!silent)setLoading(false)}
  };
  void load();
  // New patient answers appear without manual refresh or approval, including
  // when the doctor returns to an already open patient folder.
  const refresh=()=>{if(document.visibilityState==='visible')void load(true)};
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
  const timer=window.setInterval(refresh,60_000);
  return()=>{controller.abort();window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);window.clearInterval(timer)};
 },[patientId,retry,compact,synthetic]);
 const data=synthetic&&preview?preview.records:liveData;
 const error=synthetic&&preview?preview.unavailable:liveError;
 const loading=synthetic&&preview?false:liveLoading;
 const retryLoad=()=>{if(synthetic&&preview)preview.onRetry();else setRetry(x=>x+1)};
 if(loading)return compact?null:<p className="patient-reported-muted">Φόρτωση απαντήσεων…</p>;
 const failure=error?<p role="alert">Δεν φορτώθηκαν οι απαντήσεις ασθενούς. {data.length>0&&'Εμφανίζονται οι τελευταίες διαθέσιμες απαντήσεις. '}<button type="button" className="patient-reported-link" onClick={retryLoad}>Επανάληψη</button></p>:null;
 if(!data.length&&error)return failure;
 if(!data.length)return compact?null:<p className="patient-reported-muted">Δεν έχει επιστραφεί ακόμη ερωτηματολόγιο ιστορικού.</p>;
 const latest=data[0], h=normalizedPatientHistory(latest.history_answers);
 const overview=patientReportedHighlights(h);
 if(compact)return <section className="patient-reported-summary" aria-label="Ιστορικό ασθενούς">
  {failure}
  <span className="kicker">ΑΠΑΝΤΗΣΕΙΣ ΑΣΘΕΝΟΥΣ</span>
  <h2>Ο ασθενής συμπλήρωσε το ιστορικό</h2>
  <p className="patient-reported-muted">Απαντήσεις της {dateLabel(latest.submitted_at)} · αυτοαναφορά ασθενούς κατά τη συμπλήρωση, χωρίς κλινική επιβεβαίωση.</p>
  {(h.suicide_attempt==='yes'||h.self_harm==='yes')&&<p><strong>Σημαντική αυτοαναφορά ιστορικού · χρειάζεται κλινική συνεκτίμηση.</strong></p>}
  {overview.length>0&&<ul>{overview.slice(0,3).map(item=><li key={item}>{item}</li>)}</ul>}
  {onOpen&&<button type="button" className="patient-reported-link" onClick={onOpen}>Όλες οι απαντήσεις →</button>}
 </section>;
 return <section className="patient-reported-section" aria-label="Απαντήσεις ιστορικού από ασθενή">
  {failure}
  <div><span className="kicker">ΙΣΤΟΡΙΚΟ ΑΣΘΕΝΟΥΣ</span><h2>Απαντήσεις από τον ασθενή</h2><p className="patient-reported-muted">Εμφανίζονται αυτόματα μόλις υποβληθούν. Παραμένουν διακριτές από τις κλινικές σημειώσεις σας.</p></div>
  {data.map((item,index)=>{
   const answers=normalizedPatientHistory(item.history_answers),report=historyDraftFromAnswers(answers),highlights=patientReportedHighlights(answers);
   return <article key={item.id} className="patient-reported-card">
    <div className="patient-reported-card-head"><strong>{index===0?'Τελευταίο ιστορικό':'Προηγούμενο ιστορικό'} · {dateLabel(item.submitted_at)}</strong><span>{item.channel==='email'?'Email':item.channel==='tablet'?'Tablet':'Ερωτηματολόγιο'} · Αναφορά ασθενούς</span></div>
    {highlights.length>0&&<ul>{highlights.map(fact=><li key={fact}>{fact}</li>)}</ul>}
    <details><summary>Όλες οι απαντήσεις</summary><div className="patient-reported-answers">{fields.map(([key,label])=><div key={key}><strong>{label}</strong><p>{report[key]}</p></div>)}</div></details>
   </article>;
  })}
 </section>;
}
