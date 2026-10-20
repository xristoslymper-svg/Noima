'use client';
import TeleconsultationsLink from '@/components/teleconsultations/TeleconsultationsLink';
import MobileClinicalNav from '@/components/mobile/MobileClinicalNav';
import {mobileV2Enabled} from '@/components/mobile/mobile-v2';
import mobileStyles from '@/components/mobile/MobileClinical.module.css';
import {useMobileNavigation} from '@/components/useMobileNavigation';
import PilotProfile from '@/components/PilotProfile';
import './patients-stitch.css';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Bell, CalendarDays, Pencil, FileClock, Home, Menu, Plus, Search, Settings, Stethoscope, Users, X } from 'lucide-react';
import { getDemoTesterId } from '@/lib/demo-tester';

import {patientMatches,patientIdentityHint} from '@/lib/patients/patient-entry';

type DiagnosisCode={code:string;label:string};
type Row={phone?:string;landline?:string;contact_phone?:string;email?:string;id:string;first_name:string;last_name:string;reported_age:number|null;note:string;chief_complaint:string;status:string;created_at:string;updated_at:string;registry_number:number;diagnosis:DiagnosisCode|null;draft?:{id:string}|null;last_session?:{completed_at:string}|null;next_appointment?:{scheduled_start:string}|null};
const normalize=(value:string)=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('el');
const formatDate=(value?:string|null)=>value?new Intl.DateTimeFormat('el-GR',{day:'2-digit',month:'short'}).format(new Date(value)):'—';

export default function Patients(){
 const [assign,setAssign]=useState<string|null>(null);
 useEffect(()=>{const code=new URLSearchParams(window.location.search).get('assign');if(code==='PHQ-9'||code==='GAD-7')setAssign(code)},[]);
 const [q,setQ]=useState(''); const [filter,setFilter]=useState<'all'|'draft'|'active'>('all'); const [sort,setSort]=useState<'registry'|'name'|'recent'|'next'>('registry'); const [mobileNav,setMobileNav]=useMobileNavigation(); const [rows,setRows]=useState<Row[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let inFlight=false;
  const load=async()=>{
   if(inFlight||controller.signal.aborted)return;
   inFlight=true;
   try{
    const response=await fetch(`/api/patients/demo/runtime?tester=${getDemoTesterId()}`,{cache:'no-store',signal:controller.signal});
    const data=await response.json();
    if(!response.ok||!Array.isArray(data.patients))throw new Error('registry_unavailable');
    if(!controller.signal.aborted){setRows(data.patients as Row[]);setError('')}
   }catch{if(!controller.signal.aborted)setError('Δεν φορτώθηκαν οι ασθενείς. Δοκιμάστε ξανά.')}
   finally{inFlight=false;if(!controller.signal.aborted)setLoading(false)}
  };
  const refresh=()=>{if(document.visibilityState==='visible')void load()};
  void load();
  window.addEventListener('focus',refresh);
  window.addEventListener('pageshow',refresh);
  document.addEventListener('visibilitychange',refresh);
  const timer=window.setInterval(refresh,60_000);
  return()=>{controller.abort();window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);document.removeEventListener('visibilitychange',refresh);window.clearInterval(timer)};
 },[retry]);
 const filtered=useMemo(()=>{const query=normalize(q.trim());let data=rows.filter(p=>!query||patientMatches(p,q)||normalize(`${p.note} ${p.chief_complaint} ${p.diagnosis?.code||''} ${p.diagnosis?.label||''}`).includes(query));if(filter==='draft')data=data.filter(p=>p.draft);if(filter==='active')data=data.filter(p=>p.status==='active');return [...data].sort((x,y)=>sort==='registry'?x.registry_number-y.registry_number:sort==='name'?`${x.last_name}${x.first_name}`.localeCompare(`${y.last_name}${y.first_name}`,'el'):sort==='next'?(new Date(x.next_appointment?.scheduled_start||'9999-12-31').getTime()-new Date(y.next_appointment?.scheduled_start||'9999-12-31').getTime()):new Date(y.last_session?.completed_at||0).getTime()-new Date(x.last_session?.completed_at||0).getTime())},[rows,q,filter,sort]);
 return <main className={`app-shell secondary-shell patients-screen${mobileV2Enabled?` ${mobileStyles.navigationPage}`:``}`}><MobileClinicalNav active="patients"/><aside id="app-navigation" role={mobileNav?"dialog":undefined} aria-modal={mobileNav||undefined} aria-label="Κύρια πλοήγηση" className={mobileNav?'sidebar mobile-open':'sidebar'}><button className="mobile-nav-close" onClick={()=>setMobileNav(false)} aria-label="Κλείσιμο μενού"><X size={20}/></button><div className="brand"><Link href="/" className="brand-mark" aria-label="Μετάβαση στην Επισκόπηση" title="Επισκόπηση">Ψ</Link><div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div></div></div><nav className="nav"><Link href="/" className="nav-item"><Home size={19}/><span>Επισκόπηση</span></Link><Link href="/calendar" className="nav-item"><CalendarDays size={19}/><span>Ημερολόγιο</span></Link><Link href="/patients" className="nav-item active"><Users size={19}/><span>Ασθενείς</span></Link><Link href="/psychometrics" className="nav-item"><BookOpen size={19}/><span>Βιβλιοθήκη</span></Link><TeleconsultationsLink/></nav></aside>{mobileNav&&<button className="mobile-nav-backdrop" tabIndex={-1} aria-label="Κλείσιμο μενού" onClick={()=>setMobileNav(false)}/>}<section className="workspace"><header className="topbar"><button className="mobile-menu-button" aria-expanded={mobileNav} aria-controls="app-navigation" onClick={()=>setMobileNav(true)} aria-label="Άνοιγμα μενού"><Menu size={21}/></button><PilotProfile/></header><div className="secondary-content registry-page"><section className="registry-wrap">
  <div className="registry-heading"><div><span className="kicker">ΚΛΙΝΙΚΟ ΜΗΤΡΩΟ</span><h1>Ασθενείς</h1><p>Οι φάκελοι του προσωπικού σας χώρου.</p></div><Link href="/patients/new" className="record"><Plus size={18}/> Νέος ασθενής</Link></div>
  {assign&&<p role="status">Επιλέξτε ασθενή για ανάθεση {assign}.</p>}<div className="registry-stats"><div><Users/><span><strong>{rows.length}</strong> ασθενείς</span></div><div><FileClock/><span><strong>{rows.filter(x=>x.draft).length}</strong> μη ολοκληρωμένες καταγραφές</span></div></div>
  <div className="registry-tools"><div className="registry-search"><Search size={17}/><input type="search" aria-label="Αναζήτηση ασθενών" value={q} onChange={e=>setQ(e.target.value)} placeholder="Όνομα, τηλέφωνο ή email…"/></div><div className="registry-filters"><button aria-pressed={filter==='all'} className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Όλοι</button><button aria-pressed={filter==='active'} className={filter==='active'?'active':''} onClick={()=>setFilter('active')}>Ενεργοί</button><button aria-pressed={filter==='draft'} className={filter==='draft'?'active':''} onClick={()=>setFilter('draft')}>Μη ολοκληρωμένες</button><select value={sort} onChange={e=>setSort(e.target.value as 'registry'|'name'|'recent'|'next')} aria-label="Ταξινόμηση"><option value="registry">Α/Α · πρώτη επίσκεψη</option><option value="name">Όνομα</option><option value="recent">Τελευταία επίσκεψη</option><option value="next">Επόμενη επίσκεψη</option></select></div></div>
  {loading?<div className="registry-state" role="status">Φόρτωση ασθενών…</div>:<>{error&&<div className="registry-state error" role="alert">{error} <button type="button" className="registry-reset" onClick={()=>setRetry(x=>x+1)}>Επανάληψη</button></div>}{(!error||rows.length>0)&&<div className="patient-registry"><div className="registry-row registry-labels"><span>Α/Α</span><span>Ονοματεπώνυμο</span><span>ICD-10</span><span>Τελευταία</span><span>Επόμενη</span><span>Ραντεβού</span><span/></div>{filtered.map(p=><div className="registry-row" key={p.id}><span className="registry-number">{String(p.registry_number).padStart(3,'0')}</span><Link href={`/patients/demo/${p.id}${assign?'?tab=psychometrics&instrument='+encodeURIComponent(assign) :''}`} className="registry-patient registry-patient-link"><span className="registry-avatar">{p.first_name[0]}</span><div><strong>{p.first_name} {p.last_name}</strong>{p.draft&&<span className="registry-draft">Μη ολοκληρωμένη καταγραφή</span>}<small>{patientIdentityHint(p)} · Α/Α {p.registry_number}</small><small>{p.reported_age?`${p.reported_age} ετών · `:''}{p.note||p.chief_complaint||'Χωρίς κλινική σύνοψη'}</small></div></Link><span className="registry-diagnosis" title={p.diagnosis?.label||''}>{p.diagnosis?<><strong>{p.diagnosis.code}</strong><small>{p.diagnosis.label}</small></>:'—'}</span><span>{formatDate(p.last_session?.completed_at)}</span><span>{formatDate(p.next_appointment?.scheduled_start)}</span><Link className="registry-appointment" aria-label={`Νέο ραντεβού για ${p.first_name} ${p.last_name}`} href={`/calendar?patient=${encodeURIComponent(p.id)}`}>+ Νέο</Link><Link className="registry-open" aria-label={`Επεξεργασία στοιχείων ${p.first_name} ${p.last_name}`} title="Επεξεργασία στοιχείων" href={`/patients/demo/${p.id}?tab=history`}><Pencil size={17}/></Link></div>)}{!filtered.length&&<div className="registry-state" role="status">{rows.length?<><p>Δεν βρέθηκαν ασθενείς με αυτά τα φίλτρα.</p><button type="button" className="registry-reset" onClick={()=>{setQ('');setFilter('all')}}>Καθαρισμός αναζήτησης και φίλτρων</button></>:<><p>Δεν υπάρχουν ακόμη ασθενείς στον χώρο σας.</p><p>Ξεκινήστε από το «Νέος ασθενής».</p></>}</div>}</div>}</>}
 </section></div></section></main>
}
