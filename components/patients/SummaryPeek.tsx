'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Info,X} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import type {Finding} from '@/lib/clinical/summary-context';
export default function SummaryPeek({patientId}:{patientId:string}){
 const [open,setOpen]=useState(false),[pinned,setPinned]=useState(false);
 const [result,setResult]=useState<{patientId:string;findings:Finding[];mode:string}|null>(null),[error,setError]=useState(false);
 useEffect(()=>{
  if(!open||result?.patientId===patientId)return;
  let active=true;const controller=new AbortController();setError(false);
  void fetch('/api/clinical/summary',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({tester:getDemoTesterId(),patient_id:patientId})}).then(async r=>{if(!r.ok)throw Error('unavailable');return r.json()}).then(data=>{if(active)setResult({patientId,findings:data.findings,mode:data.mode})}).catch(()=>{if(active)setError(true)});
  return()=>{active=false;controller.abort()};
 },[open,patientId,result?.patientId]);
 const data=result?.patientId===patientId?result:null;
 const choose=(category:string)=>data?.findings.find(f=>f.label===category);
 const facts=[choose('Κίνδυνος'),choose('Τρέχουσα εικόνα'),data?.findings.find(f=>f.label==='Αγωγή'&&f.text.includes('ενεργή')),choose('Πλάνο')].filter((f):f is Finding=>Boolean(f));
 return <span className="summary-peek" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>{if(!pinned)setOpen(false)}} onBlur={e=>{if(!pinned&&!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}} onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();e.nativeEvent.stopImmediatePropagation();setOpen(false);setPinned(false)}}}>
  <button className="summary-peek-trigger" aria-label="Σύντομη σύνοψη ασθενή" aria-expanded={open} onFocus={()=>setOpen(true)} onClick={()=>{setPinned(!pinned);setOpen(true)}}><Info size={17}/></button>
  {open&&<span className="summary-peek-card" role="region" aria-label="Σύντομη σύνοψη"><button className="summary-peek-close" aria-label="Κλείσιμο σύνοψης" onClick={()=>{setOpen(false);setPinned(false)}}><X size={14}/></button><strong>Από τον κλινικό φάκελο</strong><small>{data?.mode==='synthesis'?'Επιλογή πηγών με AI':data?'Τεκμηριωμένες καταγραφές':'Φόρτωση…'}</small>{error?<p>Η σύνοψη δεν φορτώθηκε.</p>:facts.map(f=><span className="summary-peek-fact" key={f.key}><b>{f.label}</b><span>{f.text.length<=280?f.text:'Υπάρχει καταγεγραμμένη πηγή · δείτε την πλήρη σύνοψη.'}</span></span>)}{data&&!choose('Τρέχουσα εικόνα')&&<p>Δεν υπάρχει ολοκληρωμένη καταγραφή της τελευταίας κλινικής εικόνας.</p>}<Link href={'/patients/demo/'+patientId+'?tab=summary'}>Πλήρης σύνοψη & πηγές →</Link></span>}
  <style jsx global>{`.summary-peek{position:relative;display:inline-flex;font-size:12px;letter-spacing:normal}.summary-peek-trigger{border:0;background:#f1f5f2;color:#6c877a;border-radius:50%;width:28px;height:28px;display:grid;place-items:center;cursor:pointer}.summary-peek-card{position:absolute;top:28px;right:0;width:min(330px,75vw);z-index:110;background:white;box-shadow:0 15px 50px rgba(35,55,45,.16);border:1px solid #e1e9e3;border-radius:18px;padding:20px;color:#53695e;font-weight:400}.summary-peek-card>strong{display:block;font-size:13px;color:#2e4e3e}.summary-peek-card>small{display:block;color:#8b9990;margin-top:4px}.summary-peek-fact{display:block;margin-top:13px;line-height:1.6}.summary-peek-fact>b{display:block;font-size:11px;color:#476354}.summary-peek-fact>span{display:block;font-size:11px}.summary-peek-card>a{display:block;margin-top:14px;color:#356b59;text-decoration:none;font-size:11px}.summary-peek-close{float:right;border:0;background:none;color:#87968e;cursor:pointer}.calendar-name-row{display:flex;align-items:center;gap:10px}.calendar-name-row h3{margin-right:auto}`}</style>
 </span>;
}
