'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {getDemoTesterId} from '@/lib/demo-tester';
import {requestClinicalSummary} from '@/lib/clinical/summary-request';
import {buildClinicalCard,type ClinicalCard} from '@/lib/clinical/clinical-card';
import {buildSummaryContext,summaryContextKey,clinicDay} from '@/lib/clinical/summary-context';
import ClinicalCardView from './ClinicalCardView';
type Props={bundle:PatientBundle;compact?:boolean;onSessions:(id?:string)=>void;onPsychometrics:()=>void;onMedications:()=>void;onHistory:()=>void};
type Result={card:ClinicalCard;mode:string;context_hash:string;reason?:string|null};
export default function ClinicalSummary({bundle,compact=false}:Props){
 const [retry,setRetry]=useState(0),[refresh,setRefresh]=useState(0);
 const handledRefresh=useRef(0);
 const [result,setResult]=useState<{key:string;data:Result}|null>(null);
 const [state,setState]=useState<'loading'|'ready'|'unavailable'>('loading');
 const key=summaryContextKey(bundle,clinicDay());
 useEffect(()=>{const focus=()=>setRetry(n=>n+1);window.addEventListener('focus',focus);const timer=setInterval(focus,60000);return()=>{window.removeEventListener('focus',focus);clearInterval(timer)}},[]);
 useEffect(()=>{
  const controller=new AbortController();let active=true;setState('loading');
  const force=refresh>handledRefresh.current;handledRefresh.current=refresh;
  void requestClinicalSummary<Result>({patientId:bundle.patient.id,tester:getDemoTesterId(),hash:'',force,signal:controller.signal}).then(data=>{if(active){setResult({key,data});setState('ready')}}).catch(()=>{if(active)setState('unavailable')});
  return()=>{active=false;controller.abort()};
 },[key,retry,refresh,bundle.patient.id]);
 const card=state!=='unavailable'&&result?.key===key?result.data.card:buildClinicalCard(bundle,buildSummaryContext(bundle));
 const reason=result?.key===key?result.data.reason:null;
 const readinessText=reason==='no_completed_visit'?'Η σύνθεση θα δημιουργηθεί μετά την ολοκλήρωση της πρώτης επίσκεψης.':reason==='insufficient_notes'?'Οι σημειώσεις είναι σύντομες· εμφανίζονται οι διαθέσιμες καταγραφές, χωρίς επέκταση από το μοντέλο.':null;
 const hasDraft=bundle.sessions.some(s=>s.status==='draft');
 return <section className="clinical-summary">
  <header className="clinical-summary-head"><div><span className="summary-editorial-kicker">{compact?'ΠΡΙΝ ΤΗΝ ΕΠΙΣΚΕΨΗ':'ΜΕ ΜΙΑ ΜΑΤΙΑ'}</span><h2>{compact?'Σύντομη κλινική εικόνα':'Κλινική εικόνα'}</h2></div></header>
  {hasDraft&&<p className="clinical-summary-notice">Υπάρχει πρόχειρη επίσκεψη. Οι σημειώσεις της θα ενσωματωθούν όταν ολοκληρωθεί.</p>}
  {readinessText&&<p className="clinical-summary-notice" role="status">{readinessText}</p>}
  <ClinicalCardView card={card} patientId={bundle.patient.id} compact={compact}/>
  <footer className="clinical-card-footer"><span role="status">{state==='loading'?'Ενημέρωση…':state==='unavailable'?'Η σύνθεση δεν ανανεώθηκε.':card.synthesized?'Σύνθεση με πηγές':'Καταγραφές φακέλου'}</span><button disabled={state==='loading'} onClick={()=>setRefresh(n=>n+1)}>Ανανέωση</button>{compact&&<Link href={'/patients/demo/'+bundle.patient.id+'?tab=summary'}>Άνοιγμα κλινικής εικόνας →</Link>}</footer>
  <style jsx>{`.clinical-summary-notice{font-size:12px;line-height:1.5;color:#728278;margin:0 0 12px}.clinical-summary-head h2{margin:4px 0 15px;font-size:25px;letter-spacing:-.025em;color:#293e35}.summary-editorial-kicker{font-size:10px;color:#79887e;letter-spacing:.12em}.clinical-card-footer{display:flex;align-items:center;gap:14px;margin-top:12px;font-size:11px;color:#7c897f}.clinical-card-footer span{margin-right:auto}.clinical-card-footer button{border:0;background:none;color:#50745e;cursor:pointer}.clinical-card-footer a{color:#50745e;text-decoration:none}`}</style>
 </section>;
}
