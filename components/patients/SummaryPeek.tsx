'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Info,X} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import type {ClinicalCard} from '@/lib/clinical/clinical-card';
import {requestClinicalSummary} from '@/lib/clinical/summary-request';
import ClinicalCardView from './ClinicalCardView';

export default function SummaryPeek({patientId}:{patientId:string}){
 const [open,setOpen]=useState(false),[pinned,setPinned]=useState(false);
 const [result,setResult]=useState<{patientId:string;card:ClinicalCard}|null>(null),[error,setError]=useState(false);
 useEffect(()=>{
  if(!open)return;
  let active=true;const controller=new AbortController();setError(false);setResult(null);
  void requestClinicalSummary<{card:ClinicalCard}>({patientId,tester:getDemoTesterId(),hash:'',signal:controller.signal}).then(data=>{if(active)setResult({patientId,card:data.card})}).catch(()=>{if(active)setError(true)});
  return()=>{active=false;controller.abort()};
 },[open,patientId]);
 const data=result?.patientId===patientId?result:null;
 return <div className="summary-peek" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>{if(!pinned)setOpen(false)}} onBlur={e=>{if(!pinned&&!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}} onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();e.nativeEvent.stopImmediatePropagation();setOpen(false);setPinned(false)}}}>
  <button className="summary-peek-trigger" aria-label="Σύντομη κλινική εικόνα" aria-expanded={open} onFocus={()=>setOpen(true)} onClick={()=>{setPinned(!pinned);setOpen(true)}}><Info size={17}/></button>
  {open&&<div className="summary-peek-card" role="region" aria-label="Σύντομη κλινική εικόνα">
   <button className="summary-peek-close" aria-label="Κλείσιμο σύνοψης" onClick={()=>{setOpen(false);setPinned(false)}}><X size={14}/></button>
   <span className="summary-peek-kicker">ΕΠΟΜΕΝΗ ΣΥΝΕΔΡΙΑ</span>
   <strong><span aria-hidden="true">✦</span> Σύντομη κλινική εικόνα</strong>
   {error?<p>Η εικόνα δεν φορτώθηκε.</p>:!data?<p className="summary-peek-muted">Φόρτωση…</p>:<ClinicalCardView card={data.card} patientId={patientId} compact/>}
   <Link href={'/patients/demo/'+patientId+'?tab=summary'}>Άνοιγμα κλινικής εικόνας →</Link>
  </div>}
  <style jsx global>{`.summary-peek{position:relative;display:inline-flex;font-size:12px;letter-spacing:normal}.summary-peek-trigger{border:0;background:#f1f5f2;color:#6c877a;border-radius:50%;width:28px;height:28px;display:grid;place-items:center;cursor:pointer}.summary-peek-card{position:absolute;top:30px;right:0;width:min(390px,78vw);max-height:75vh;overflow:auto;z-index:110;background:#f5faf6;box-shadow:0 18px 55px rgba(35,55,45,.15);border:1px solid #e2ede5;border-radius:20px;padding:20px 20px 17px;color:#53695e;font-weight:400}.summary-peek-kicker{display:block;font-size:8px;letter-spacing:.15em;font-weight:800;color:#82958b;margin-bottom:6px}.summary-peek-card>.clinical-card{margin-top:12px}.summary-peek-card>strong{display:flex;align-items:center;gap:6px;font-size:14px;letter-spacing:-.02em;color:#263d33;padding-right:22px}.summary-peek-card>strong>span{color:#477663}.summary-peek-card>p{font-size:10.5px;line-height:1.5}.summary-peek-muted{color:#87978f}.summary-peek-card>a{display:block;margin-top:12px;color:#456f62;text-decoration:none;font-size:10px;font-weight:700}.summary-peek-close{float:right;border:0;background:none;color:#87968e;cursor:pointer;padding:0}.calendar-name-row{display:flex;align-items:center;gap:10px}.calendar-name-row h3{margin-right:auto}`}</style>
 </div>;
}
