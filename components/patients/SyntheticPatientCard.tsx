'use client';
import {useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,Activity,CalendarDays,FlaskConical,MessageCircle} from 'lucide-react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import styles from './SyntheticPatientCard.module.css';
const tabs=['Επισκόπηση','Επισκέψεις','Αγωγή','Μετρήσεις'] as const;
const date=(value:string)=>new Date(value).toLocaleDateString('el-GR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
export default function SyntheticPatientCard({bundle}:{bundle:PatientBundle}){
 const [tab,setTab]=useState<typeof tabs[number]>('Επισκόπηση');
 const visits=bundle.sessions.filter(s=>s.status==='completed').sort((a,b)=>b.started_at.localeCompare(a.started_at));
 return <main className={styles.page}>
  <nav className={styles.nav}><Link href="/"><ArrowLeft size={16}/> Επιστροφή στην επισκόπηση</Link><span>NOIMA <b>/</b> Καρτέλα ασθενή</span></nav>
  <div className={styles.notice}><FlaskConical size={18}/><div><strong>Συνθετική ασθενής · Δοκιμαστικό περιβάλλον</strong><p>Φανταστικό ιστορικό για δοκιμή του Βοηθού Ψ. Δεν αποθηκεύονται αλλαγές σε καρτέλες.</p></div></div>
  <header className={styles.header}><div className={styles.avatar}>ΜΔ</div><div><span className={styles.eyebrow}>ΚΑΡΤΕΛΑ ΑΣΘΕΝΗ</span><h1>{bundle.patient.first_name} {bundle.patient.last_name}</h1><p>Αϋπνία και άγχος <span>•</span> 8 ολοκληρωμένες επισκέψεις</p></div><div className={styles.last}><CalendarDays size={18}/><div>Τελευταία επίσκεψη<strong>10 Σεπτεμβρίου 2026</strong></div></div></header>
  <div className={styles.tabs} role="tablist" aria-label="Ενότητες καρτέλας">{tabs.map(t=><button key={t} id={'tab-'+t} type="button" role="tab" aria-selected={tab===t} aria-controls="chart-panel" onClick={()=>setTab(t)}>{t}</button>)}</div>
  <section id="chart-panel" role="tabpanel" aria-labelledby={'tab-'+tab} className={styles.content}>
   {tab==='Επισκόπηση'&&<><div className={styles.mainGrid}><article className={styles.card}><span className={styles.eyebrow}>ΤΕΛΕΥΤΑΙΑ ΕΙΚΟΝΑ</span><h2>Ύπνος & καθημερινότητα</h2><p>Στις 10 Σεπτεμβρίου αναφέρει αϋπνία. Στην προηγούμενη επίσκεψη, στις 10 Αυγούστου, αρνείται αϋπνία.</p><p className={styles.muted}>Οι ανεπιθύμητες ενέργειες δεν διερευνήθηκαν στην τελευταία επίσκεψη.</p></article><article className={styles.card}><span className={styles.eyebrow}>ΠΡΟΣΟΧΗ ΣΤΟ ΙΣΤΟΡΙΚΟ</span><h2>Αγωγή προς επιβεβαίωση</h2><p>Για το Fictional A υπάρχει καταγραφή διακοπής στις 10 Αυγούστου, ενώ η λίστα αγωγής το εμφανίζει ακόμη ενεργό.</p><span className={styles.tag}>Επιβεβαίωση στην καρτέλα</span></article></div><article className={styles.card}><div className={styles.sectionTitle}><Activity size={19}/><h2>Πρόσφατες μετρήσεις</h2></div><div className={styles.scores}>{['PHQ-9','GAD-7'].map(i=><div key={i}><span>{i}</span><strong>12</strong><small>10 Σεπ 2026 · προηγούμενη: 13</small></div>)}</div></article><div className={styles.tip}><MessageCircle size={20}/><div><strong>Ρώτησε τον Βοηθό Ψ</strong><p>Άνοιξε το chat κάτω αριστερά. Δοκίμασε: «Τι άλλαξε από την προηγούμενη επίσκεψη;»</p></div></div></>}
   {tab==='Επισκέψεις'&&<article className={styles.card}><h2>Ιστορικό επισκέψεων</h2>{visits.map(v=><div className={styles.row} key={v.id}><strong>{date(v.started_at)}</strong><p>{bundle.sections.filter(s=>s.session_id===v.id).map(s=>s.content).join(' ')}</p></div>)}</article>}
   {tab==='Αγωγή'&&<article className={styles.card}><h2>Καταγεγραμμένη αγωγή</h2><p className={styles.muted}>Τα ονόματα φαρμάκων είναι φανταστικά.</p>{bundle.medications.map(m=><div className={styles.row} key={m.id}><strong>{m.medication_name} · {m.dose} {m.unit}</strong><p>Η λίστα το εμφανίζει ενεργό. Έναρξη φαρμάκου: {date(m.started_at!)}.</p>{bundle.medicationEvents.filter(e=>e.medication_id===m.id).map(e=><p key={e.id} className={styles.event}>{date(e.effective_on||e.created_at)} — {e.event_type==='started'?'Έναρξη 10 mg':e.event_type==='changed'?'Αλλαγή σε 20 mg':'Διακοπή'}</p>)}</div>)}</article>}
   {tab==='Μετρήσεις'&&<article className={styles.card}><h2>Ολοκληρωμένες μετρήσεις</h2><div className={styles.tableWrap}><table><thead><tr><th>Ημερομηνία</th><th>Εργαλείο</th><th>Βαθμολογία</th></tr></thead><tbody>{bundle.assessments.filter(a=>a.status==='completed').sort((a,b)=>(b.completed_at||b.created_at).localeCompare(a.completed_at||a.created_at)).map(a=><tr key={a.id}><td>{date(a.completed_at||a.created_at)}</td><td>{a.instrument}</td><td>{a.score}</td></tr>)}</tbody></table></div></article>}
  </section>
 </main>;
}
