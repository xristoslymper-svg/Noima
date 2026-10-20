'use client';
import {useTranslations} from 'next-intl';
import {useLocale} from 'next-intl';
import {useSystemMessage} from '@/i18n/system-message';
import TeleconsultationsLink from '@/components/teleconsultations/TeleconsultationsLink';
import MobileClinicalNav from '@/components/mobile/MobileClinicalNav';
import {mobileV2Enabled} from '@/components/mobile/mobile-v2';
import mobileStyles from '@/components/mobile/MobileClinical.module.css';
import {useMobileNavigation} from '@/components/useMobileNavigation';
import PilotProfile from '@/components/PilotProfile';
import './patients-stitch.css';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarDays, FileClock, Home, Menu, Plus, Search, Users, X } from 'lucide-react';
import { getDemoTesterId } from '@/lib/demo-tester';

import PatientRegistryTable from '@/components/patients/PatientRegistryTable';
import type {PatientRegistryRow as Row} from '@/lib/patients/registry-layout';
import {patientMatches} from '@/lib/patients/patient-entry';

const normalize=(value:string)=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('el');

export default function Patients(){
 const t=useTranslations();

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
 return <main className={`app-shell secondary-shell patients-screen${mobileV2Enabled?` ${mobileStyles.navigationPage}`:``}`}><MobileClinicalNav active="patients"/><aside id="app-navigation" role={mobileNav?"dialog":undefined} aria-modal={mobileNav||undefined} aria-label={t('accessibility.mainNavigation')} className={mobileNav?'sidebar mobile-open':'sidebar'}><button className="mobile-nav-close" onClick={()=>setMobileNav(false)} aria-label={t('accessibility.closeMenu')}><X size={20}/></button><div className="brand"><Link href="/" className="brand-mark" aria-label={t('accessibility.goToOverview')} title={t('navigation.overview')}>Ψ</Link><div className="brand-copy"><div className="brand-sub">{t('navigation.tagline')}</div></div></div><nav className="nav"><Link href="/" className="nav-item"><Home size={19}/><span>{t('navigation.overview')}</span></Link><Link href="/calendar" className="nav-item"><CalendarDays size={19}/><span>{t('navigation.calendar')}</span></Link><Link href="/patients" className="nav-item active"><Users size={19}/><span>{t('navigation.patients')}</span></Link><Link href="/psychometrics" className="nav-item"><BookOpen size={19}/><span>{t('navigation.library')}</span></Link><TeleconsultationsLink/></nav></aside>{mobileNav&&<button className="mobile-nav-backdrop" tabIndex={-1} aria-label={t('accessibility.closeMenu')} onClick={()=>setMobileNav(false)}/>}<section className="workspace"><header className="topbar"><button className="mobile-menu-button" aria-expanded={mobileNav} aria-controls="app-navigation" onClick={()=>setMobileNav(true)} aria-label={t('accessibility.openMenu')}><Menu size={21}/></button><PilotProfile/></header><div className="secondary-content registry-page"><section className="registry-wrap">
  <div className="registry-heading"><div><span className="kicker">{t('patients.registryKicker')}</span><h1>{t('navigation.patients')}</h1><p>{t('patients.registryDescription')}</p></div><Link href="/patients/new" className="record"><Plus size={18}/>  {t('patients.newPatient')}</Link></div>
  {assign&&<p role="status">{t('patients.selectForAssignment')} {assign}.</p>}<div className="registry-stats"><div><Users/><span>{t('patients.patientCount',{count:rows.length})}</span></div><div><FileClock/><span>{t('visits.pendingDraftCount',{count:rows.filter(x=>x.draft).length}</strong>{t('current.m024')}</span></div></div>
  <div className="registry-tools"><div className="registry-search"><Search size={17}/><input type="search" aria-label={t('patients.search')} value={q} onChange={e=>setQ(e.target.value)} placeholder={t('current.m026')}/></div><div className="registry-filters"><button aria-pressed={filter==='all'} className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>{t('common.allPeople')}</button><button aria-pressed={filter==='active'} className={filter==='active'?'active':''} onClick={()=>setFilter('active')}>{t('patients.active')}</button><button aria-pressed={filter==='draft'} className={filter==='draft'?'active':''} onClick={()=>setFilter('draft')}>{t('current.m025')}</button><select value={sort} onChange={e=>setSort(e.target.value as 'registry'|'name'|'recent'|'next')} aria-label={t('common.sort')}><option value="registry">{t('patients.registrySort')}</option><option value="name">{t('patients.firstName')}</option><option value="recent">{t('patients.lastVisit')}</option><option value="next">{t('patients.nextVisit')}</option></select></div></div>
  {loading?<div className="registry-state" role="status">{t('patients.loading')}</div>:<>{error&&<div className="registry-state error" role="alert">{error} <button type="button" className="registry-reset" onClick={()=>setRetry(x=>x+1)}>{t('calendar.recurrence')}</button></div>}{(!error||rows.length>0)&&<PatientRegistryTable rows={filtered} total={rows.length} assign={assign} onReset={()=>{setQ('');setFilter('all')}}/>}</>}
 </section></div></section></main>
}
