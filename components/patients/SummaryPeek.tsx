'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Info,X} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import type {Finding} from '@/lib/clinical/summary-context';

const themeSymbol:Record<string,string>={general:'◉',medication:'✚',course:'↗',risk:'⚑',psychometrics:'◌',plan:'→',context:'◎'};
function fallbackTheme(finding:Finding){
 if(finding.attention||finding.label==='Κίνδυνος'||finding.label==='Χρειάζεται επιβεβαίωση')return 'risk';
 if(finding.label==='Αγωγή'||finding.label==='Παρενέργειες')return 'medication';
 if(finding.label==='Πορεία')return 'course';
 if(finding.label==='Ψυχομετρικά')return 'psychometrics';
 if(finding.label==='Πλάνο')return 'plan';
 if(finding.label==='Σημαντικό ιστορικό')return 'context';
 return 'general';
}

export default function SummaryPeek({patientId}:{patientId:string}){
 const [open,setOpen]=useState(false),[pinned,setPinned]=useState(false);
 const [result,setResult]=useState<{patientId:string;findings:Finding[];mode:string}|null>(null),[error,setError]=useState(false);
 useEffect(()=>{
  if(!open||result?.patientId===patientId)return;
  let active=true;const controller=new AbortController();setError(false);
  const query=new URLSearchParams({tester:getDemoTesterId(),patient_id:patientId});
  void fetch('/api/clinical/summary?'+query.toString(),{method:'GET',signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('unavailable');return r.json()}).then(data=>{if(active)setResult({patientId,findings:Array.isArray(data.findings)?data.findings:[],mode:data.mode})}).catch(()=>{if(active)setError(true)});
  return()=>{active=false;controller.abort()};
 },[open,patientId,result?.patientId]);
 const data=result?.patientId===patientId?result:null;
 const groups=(data?.findings||[]).reduce<{key:string;label:string;theme:string;items:Finding[]}[]>((all,finding)=>{
  const label=finding.origin==='synthesis'&&finding.group_label?finding.group_label:finding.label;
  const theme=finding.origin==='synthesis'&&finding.theme?finding.theme:fallbackTheme(finding);
  const key=theme+'|'+label;const found=all.find(group=>group.key===key);
  if(found)found.items.push(finding);else all.push({key,label,theme,items:[finding]});
  return all;
 },[]).slice(0,4);
 return <span className="summary-peek" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>{if(!pinned)setOpen(false)}} onBlur={e=>{if(!pinned&&!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}} onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();e.nativeEvent.stopImmediatePropagation();setOpen(false);setPinned(false)}}}>
  <button className="summary-peek-trigger" aria-label="Σύνοψη πριν τη συνεδρία" aria-expanded={open} onFocus={()=>setOpen(true)} onClick={()=>{setPinned(!pinned);setOpen(true)}}><Info size={17}/></button>
  {open&&<span className="summary-peek-card" role="region" aria-label="Σύνοψη πριν τη συνεδρία">
   <button className="summary-peek-close" aria-label="Κλείσιμο σύνοψης" onClick={()=>{setOpen(false);setPinned(false)}}><X size={14}/></button>
   <span className="summary-peek-kicker">ΕΠΟΜΕΝΗ ΣΥΝΕΔΡΙΑ</span>
   <strong><span aria-hidden="true">✦</span> Σύνοψη πριν τη συνεδρία</strong>
   {error?<p>Η σύνοψη δεν φορτώθηκε.</p>:!data?<p className="summary-peek-muted">Φόρτωση…</p>:groups.length?<span className="summary-peek-groups">{groups.map(group=><span className="summary-peek-group" key={group.key}>
    <b><i aria-hidden="true">{themeSymbol[group.theme]||'◉'}</i>{group.label}</b>
    {group.items.slice(0,2).map(f=><span className="summary-peek-fact" key={f.key}>{f.text.length<=220?f.text:f.text.slice(0,217)+'…'}</span>)}
   </span>)}</span>:<p className="summary-peek-muted">Δεν υπάρχει ακόμη διαθέσιμη σύνοψη.</p>}
   <Link href={'/patients/demo/'+patientId+'?tab=summary'}>Πλήρης σύνοψη →</Link>
  </span>}
  <style jsx global>{`.summary-peek{position:relative;display:inline-flex;font-size:12px;letter-spacing:normal}.summary-peek-trigger{border:0;background:#f1f5f2;color:#6c877a;border-radius:50%;width:28px;height:28px;display:grid;place-items:center;cursor:pointer}.summary-peek-card{position:absolute;top:30px;right:0;width:min(350px,78vw);z-index:110;background:#f5faf6;box-shadow:0 18px 55px rgba(35,55,45,.15);border:1px solid #e2ede5;border-radius:20px;padding:20px 20px 17px;color:#53695e;font-weight:400}.summary-peek-kicker{display:block;font-size:8px;letter-spacing:.15em;font-weight:800;color:#82958b;margin-bottom:6px}.summary-peek-card>strong{display:flex;align-items:center;gap:6px;font-size:14px;letter-spacing:-.02em;color:#263d33;padding-right:22px}.summary-peek-card>strong>span{color:#477663}.summary-peek-groups{display:flex;flex-direction:column;margin-top:13px}.summary-peek-group{display:block;padding:9px 0}.summary-peek-group+.summary-peek-group{border-top:1px solid rgba(76,108,94,.1)}.summary-peek-group>b{display:flex;align-items:center;gap:7px;font-size:10px;color:#3d5a4d}.summary-peek-group>b>i{display:inline-flex;width:13px;justify-content:center;color:#55796a;font-size:11px;font-style:normal;font-weight:500}.summary-peek-fact{display:block;margin:4px 0 0 20px;color:#596d64;font-size:10.5px;line-height:1.5}.summary-peek-card>p{font-size:10.5px;line-height:1.5}.summary-peek-muted{color:#87978f}.summary-peek-card>a{display:block;margin-top:12px;color:#456f62;text-decoration:none;font-size:10px;font-weight:700}.summary-peek-close{float:right;border:0;background:none;color:#87968e;cursor:pointer;padding:0}.calendar-name-row{display:flex;align-items:center;gap:10px}.calendar-name-row h3{margin-right:auto}`}</style>
 </span>;
}
