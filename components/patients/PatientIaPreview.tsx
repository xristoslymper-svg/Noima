'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,BookOpen,CalendarDays,Home,Menu,Users,X} from 'lucide-react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import PilotProfile from '@/components/PilotProfile';
import PatientRecordHeader from './PatientRecordHeader';
import PatientSummaryView from './PatientSummaryView';
import PatientTimeline from './PatientTimeline';
import PatientTreatmentView from './PatientTreatmentView';

type Tab='summary'|'sessions'|'medications'|'history';

const previewBundle={
 clinical_day:'2026-10-08',
 patient:{id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',tester_id:'00000000-0000-0000-0000-000000000001',first_name:'Nikos',last_name:'Trikolis',reported_age:36,phone:'',landline:'',contact_phone:'',amka:'',address:'',email:'nikos@example.test',chief_complaint:'',note:'',status:'active',created_at:'2026-08-01T09:00:00Z',updated_at:'2026-10-05T18:51:00Z'},
 sessions:[
  {id:'11111111-1111-4111-8111-111111111111',tester_id:'00000000-0000-0000-0000-000000000001',patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',session_type:'initial_assessment',status:'completed',version:4,started_at:'2026-08-01T10:00:00Z',completed_at:'2026-08-01T11:00:00Z',updated_at:'2026-08-01T11:00:00Z'},
  {id:'22222222-2222-4222-8222-222222222222',tester_id:'00000000-0000-0000-0000-000000000001',patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',session_type:'follow_up',status:'completed',version:6,started_at:'2026-09-12T15:00:00Z',completed_at:'2026-09-12T15:45:00Z',updated_at:'2026-09-12T15:45:00Z'},
  {id:'33333333-3333-4333-8333-333333333333',tester_id:'00000000-0000-0000-0000-000000000001',patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',session_type:'follow_up',status:'completed',version:5,started_at:'2026-10-05T15:51:00Z',completed_at:'2026-10-05T16:30:00Z',updated_at:'2026-10-05T16:30:00Z'}
 ],
 sections:[],
 risks:[
  {session_id:'33333333-3333-4333-8333-333333333333',patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',suicidal_ideation:'negative',intent:'not_assessed',plan:'not_assessed',self_harm:'negative',attempt_history:'negative',protective_factors:'Οικογένεια, θεραπευτική συμμαχία',clinical_note:'',version:2,updated_at:'2026-10-05T16:20:00Z'}
 ],
 history:{patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',psychiatric_history:'Προηγούμενο καταθλιπτικό επεισόδιο. Η διαγνωστική εικόνα παραμένει υπό κλινική επανεκτίμηση.',medical_history:'Χωρίς σημαντικό ενεργό ιατρικό ιστορικό στην παρούσα δοκιμαστική καταγραφή.',previous_treatments:'Προηγούμενη δοκιμή αντικαταθλιπτικής αγωγής.',hospitalizations:'Καμία καταγεγραμμένη ψυχιατρική νοσηλεία.',family_history:'Δεν έχει καταγραφεί σχετικό οικογενειακό ιστορικό.',substance_history:'Δεν έχει καταγραφεί προβληματική χρήση ουσιών.',social_functioning:'Εργάζεται. Πρόσφατα αναφέρει δυσκολία συγκέντρωσης και μειωμένη ενεργητικότητα.',allergies:'',version:1,updated_at:'2026-10-05T16:00:00Z'},
 medications:[
  {plan_version:3,id:'44444444-4444-4444-8444-444444444444',patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',medication_name:'Seroquel',dose:50,unit:'mg',frequency:'1 × βράδυ',effective_from:'2026-09-12',started_at:'2026-09-12',ended_at:null,status:'active',notes:'',updated_at:'2026-10-05T16:10:00Z'}
 ],
 medicationEvents:[
  {id:'55555555-5555-4555-8555-555555555555',patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',medication_id:'44444444-4444-4444-8444-444444444444',session_id:'22222222-2222-4222-8222-222222222222',event_type:'started',previous_state:null,new_state:{dose:25,unit:'mg',frequency:'1 × βράδυ'},reason:'Έναρξη αγωγής',effective_on:'2026-09-12',created_at:'2026-09-12T15:35:00Z'},
  {id:'66666666-6666-4666-8666-666666666666',patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',medication_id:'44444444-4444-4444-8444-444444444444',session_id:'33333333-3333-4333-8333-333333333333',event_type:'changed',previous_state:{dose:25,unit:'mg',frequency:'1 × βράδυ'},new_state:{dose:50,unit:'mg',frequency:'1 × βράδυ'},reason:'Προσαρμογή δόσης',effective_on:'2026-10-05',created_at:'2026-10-05T16:12:00Z'}
 ],
 medicationSideEffects:[
  {id:'77777777-7777-4777-8777-777777777777',patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',medication_id:'44444444-4444-4444-8444-444444444444',session_id:'33333333-3333-4333-8333-333333333333',effect_text:'Πρωινή υπνηλία',severity:'mild',impact:'Ήπια επιβάρυνση το πρωί',noted_on:'2026-10-05',resolved_on:null,note:'',created_at:'2026-10-05T16:14:00Z',updated_at:'2026-10-05T16:14:00Z'}
 ],
 medicationRevisions:[],proposals:[],addenda:[],corrections:[],
 assessments:[
  {id:'88888888-8888-4888-8888-888888888888',patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',instrument:'PHQ-9',instrument_version:'1',status:'completed',score:16,answers:null,item9_review:false,item9_reviewed_at:null,reviewed_at:'2026-09-12T14:55:00Z',appointment_id:null,session_id:'22222222-2222-4222-8222-222222222222',expires_at:'2026-09-20T00:00:00Z',created_at:'2026-09-11T12:00:00Z',completed_at:'2026-09-12T14:45:00Z',provenance:'patient_link'},
  {id:'99999999-9999-4999-8999-999999999999',patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',instrument:'PHQ-9',instrument_version:'1',status:'completed',score:11,answers:null,item9_review:false,item9_reviewed_at:null,reviewed_at:'2026-10-05T15:45:00Z',appointment_id:null,session_id:'33333333-3333-4333-8333-333333333333',expires_at:'2026-10-12T00:00:00Z',created_at:'2026-10-04T12:00:00Z',completed_at:'2026-10-05T15:30:00Z',provenance:'patient_link'},
  {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',patient_id:'0d1fac14-fccf-40c0-ad8a-2e991e5ce55e',instrument:'GAD-7',instrument_version:'1',status:'completed',score:12,answers:null,item9_review:false,item9_reviewed_at:null,reviewed_at:'2026-10-05T15:45:00Z',appointment_id:null,session_id:'33333333-3333-4333-8333-333333333333',expires_at:'2026-10-12T00:00:00Z',created_at:'2026-10-04T12:00:00Z',completed_at:'2026-10-05T15:31:00Z',provenance:'patient_link'}
 ],
 appointments:[
  {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',session_id:'33333333-3333-4333-8333-333333333333',appointment_type:'follow_up',scheduled_start:'2026-10-05T15:51:00Z',scheduled_end:'2026-10-05T16:36:00Z',status:'completed'},
  {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',session_id:null,appointment_type:'follow_up',scheduled_start:'2026-10-14T15:00:00Z',scheduled_end:'2026-10-14T15:45:00Z',status:'scheduled'}
 ]
} as unknown as PatientBundle;

export default function PatientIaPreview(){
 const [tab,setTab]=useState<Tab>('summary');
 const [mobileNav,setMobileNav]=useState(false);
 const beforeNavigate=useRef<(()=>Promise<void>)|null>(null);
 const noop=async()=>undefined;
 return <main className="app-shell secondary-shell patient-ia-static-preview">
  <aside className={mobileNav?'sidebar mobile-open':'sidebar'}><button className="mobile-nav-close" onClick={()=>setMobileNav(false)} aria-label="Κλείσιμο μενού"><X size={20}/></button><div className="brand"><div className="brand-mark">Ψ</div><div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη κλινική πράξη</div></div></div><nav className="nav"><span className="nav-item"><Home size={19}/><span>Επισκόπηση</span></span><span className="nav-item"><CalendarDays size={19}/><span>Ημερολόγιο</span></span><span className="nav-item active"><Users size={19}/><span>Ασθενείς</span></span><span className="nav-item"><BookOpen size={19}/><span>Βιβλιοθήκη</span></span></nav></aside>
  {mobileNav&&<button className="mobile-nav-backdrop" aria-label="Κλείσιμο μενού" onClick={()=>setMobileNav(false)}/>}
  <section className="workspace"><header className="topbar"><button className="mobile-menu-button" onClick={()=>setMobileNav(true)} aria-label="Άνοιγμα μενού"><Menu size={21}/></button><PilotProfile/></header>
   <div className="generic-patient-page patient-record-v2">
    <div className="ia-preview-notice"><span>UI PREVIEW</span><strong>Νέα αρχιτεκτονική φακέλου · στατικά υποθετικά δεδομένα</strong><Link href="/login"><ArrowLeft size={13}/> Επιστροφή στη σύνδεση</Link></div>
    <PatientRecordHeader bundle={previewBundle} actionLabel="Νέα επανεξέταση" actionMeta="Preview · δεν αποθηκεύει" onPrimaryAction={()=>{}} onHistory={()=>setTab('history')} onExport={()=>{}}/>
    <nav className="patient-record-tabs" aria-label="Κλινικός φάκελος"><button className={tab==='summary'?'active':''} onClick={()=>setTab('summary')}>Σύνοψη</button><button className={tab==='sessions'?'active':''} onClick={()=>setTab('sessions')}>Πορεία</button><button className={tab==='medications'?'active':''} onClick={()=>setTab('medications')}>Θεραπεία</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Ιστορικό</button></nav>
    <div className="patient-record-content">
     {tab==='summary'&&<PatientSummaryView bundle={previewBundle} previewOnly onOpenVisit={()=>setTab('sessions')} onTreatment={()=>setTab('medications')} onHistory={()=>setTab('history')}/>}
     {tab==='sessions'&&<PatientTimeline bundle={previewBundle} onOpenVisit={()=>{}} onResumeDraft={()=>{}}/>}
     {tab==='medications'&&<PatientTreatmentView bundle={previewBundle} reload={noop} beforeNavigate={beforeNavigate} readOnly onTimeline={()=>setTab('sessions')}/>}
     {tab==='history'&&<section className="preview-history"><div className="patient-section-heading"><div><span className="kicker">ΙΣΤΟΡΙΚΟ</span><h2>Σταθερό κλινικό υπόβαθρο</h2></div></div><div className="preview-history-grid">{[
      ['Ψυχιατρικό ιστορικό',previewBundle.history?.psychiatric_history],
      ['Προηγούμενες θεραπείες',previewBundle.history?.previous_treatments],
      ['Νοσηλείες',previewBundle.history?.hospitalizations],
      ['Ιατρικό ιστορικό',previewBundle.history?.medical_history],
      ['Ουσίες',previewBundle.history?.substance_history],
      ['Κοινωνική λειτουργικότητα',previewBundle.history?.social_functioning],
     ].map(([label,value])=><article key={label}><small>{label}</small><p>{value||'—'}</p></article>)}</div></section>}
    </div>
   </div>
  </section>
 </main>;
}
