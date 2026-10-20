'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useLocale,useTranslations} from 'next-intl';
import Link from 'next/link';
import {useRef,useState} from 'react';
import {Home,CalendarDays,Users,BookOpen,Video,Plus,Search,ArrowRight} from 'lucide-react';
import {findDemoPatients,newDemoVisit,type DemoTelePatient} from '@/lib/teleconsultations/entry';
import {currentMeetings} from '@/lib/teleconsultations/meeting-start';
import type {FixtureRecord} from '@/lib/teleconsultations/preview';
import styles from './Teleconsultations.module.css';
type Entry={record:FixtureRecord;patient:DemoTelePatient;completed:boolean;active?:boolean};
export default function TeleconsultationsLobby({entries,onOpen,patients,onStart,connected=false,busy=false}:{entries:Entry[];onOpen:(record:FixtureRecord,patient:DemoTelePatient)=>void;patients?:DemoTelePatient[];onStart?:(patient:DemoTelePatient)=>void;connected?:boolean;busy?:boolean}){
 const ui=useUiText();

 const locale=useLocale();
 const t=useTranslations();

 const [creating,setCreating]=useState(false),[query,setQuery]=useState(''),[selected,setSelected]=useState<DemoTelePatient|null>(null);
 const startButton=useRef<HTMLButtonElement>(null);
 function cancel(){setCreating(false);setQuery('');setSelected(null);startButton.current?.focus()}
 const q=query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el');
 const matches=patients?(q.length<2?[]:patients.filter(p=>p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').includes(q)).slice(0,12)):findDemoPatients(query);
 const current=currentMeetings(entries),choices=selected?entries.filter(e=>e.patient.id===selected.id&&!e.completed&&!e.record.sessionId.startsWith('appointment:')):[];
 function start(){if(!selected||busy)return;if(onStart){onStart(selected);return}else if(choices.length===1)onOpen(choices[0].record,selected);else onOpen(newDemoVisit(selected.id,Date.now(),crypto.randomUUID()),selected);setCreating(false);setQuery('');setSelected(null)}
 return <main className="app-shell secondary-shell"><aside className="sidebar"><div className="brand"><Link href="/" className="brand-mark">Ψ</Link><div className="brand-copy"><div className="brand-sub">{t('navigation.tagline')}</div></div></div><nav className="nav" aria-label={t('accessibility.mainNavigation')}><Link href="/" className="nav-item"><Home size={19}/>{t('navigation.overview')}</Link><Link href="/calendar" className="nav-item"><CalendarDays size={19}/>{t('navigation.calendar')}</Link><Link href="/patients" className="nav-item"><Users size={19}/>{t('navigation.patients')}</Link><Link href="/psychometrics" className="nav-item"><BookOpen size={19}/>{t('navigation.library')}</Link><Link href="/teleconsultations" className="nav-item active" aria-current="page"><Video size={19}/>{t('current.m268')}</Link></nav></aside>
 <div className="workspace"><div className={styles.content+' '+styles.lobby}><header className={'page-heading '+styles.pageHeader}><div><h1>{t('current.m268')}</h1><p>{t('current.m293')}</p></div><Link className="small-button" href="/calendar"><CalendarDays size={15}/>{t('navigation.calendar')}</Link></header>
 <section className={'card '+styles.startCard} aria-label={t('current.m157')}><span className={styles.startIcon}><Video size={25}/></span><div><h2>{t('current.m294')}</h2><p>{t('current.m295')}</p></div><button type="button" className="record compact" ref={startButton} disabled={busy} onClick={()=>creating?cancel():setCreating(true)} aria-expanded={creating} aria-controls="tele-start-form"><Plus size={16}/>{t('current.m296')}</button>
 {creating&&<div id="tele-start-form" className={styles.startForm}><label><Search size={16}/>{t('current.m297')}<input type="search" autoComplete="off" autoFocus disabled={busy} aria-label={t('current.m297')} aria-describedby="tele-search-hint" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();cancel()}if(event.key==='Enter'){event.preventDefault();if(selected)start();else if(matches.length===1)setSelected(matches[0])}}} placeholder={t('current.m304')} value={query} onChange={event=>{setQuery(event.target.value);setSelected(null)}}/></label><p id="tele-search-hint" className={styles.searchHint}>{selected?ui('Επιλέχθηκε: ')+selected.name:ui('Αναζητήστε με όνομα ή επώνυμο. Enter για επιλογή, Escape για κλείσιμο.')}</p>{q.length<2?<p className={styles.searchHint}>{t('current.m298')}</p>:!matches.length?<p role="status">{t('patients.noPatientFound')}</p>:<div className={styles.patientResults} role="group" aria-label={t('current.m305')}>{matches.map(patient=><button type="button" className="small-button" disabled={busy} aria-pressed={selected?.id===patient.id} key={patient.id} onClick={()=>setSelected(patient)}>{patient.name}</button>)}</div>}
 {choices.length>1&&<div className={styles.visitChoices}><p>{t('current.m299')}</p>{choices.map(entry=><button key={entry.record.sessionId} type="button" className="small-button" disabled={busy} onClick={()=>onOpen(entry.record,entry.patient)}>{new Intl.DateTimeFormat(locale,{timeZone:'Europe/Athens',dateStyle:'medium',timeStyle:'short'}).format(new Date(entry.record.appointment.scheduled_start))}<ArrowRight size={14}/></button>)}</div>}
 <div className={styles.actions}><button type="button" className="small-button" disabled={busy} onClick={cancel}>{t('common.cancel')}</button><button type="button" className="record compact" disabled={!selected||busy||choices.length>1} onClick={start}>{busy?t('common.opening'):t('currentExtra.m147')}<ArrowRight size={15}/></button></div></div>}
 </section>
 <p className={styles.simulationNote}>{connected?ui('Προσομοίωση βίντεο · Οι σημειώσεις αποθηκεύονται στην ίδια επίσκεψη του φακέλου.'):ui('Προσομοίωση τηλεσυνεδρίας · Χωρίς βίντεο ή εγγραφή στη βάση. Τα συνθετικά προσχέδια χάνονται με ανανέωση.')}</p>
 <section aria-label={t('current.m306')} className={styles.todaySection}><div className={styles.todayHeading}><h2>{t('current.m300')}</h2>{current.length>6&&<Link href="/calendar">{t('polish.m120')}{current.length})</Link>}</div>{current.length?<div className={styles.meetingRows}>{current.slice(0,6).map(entry=><article key={entry.record.sessionId} className={styles.meetingRow}><time>{new Intl.DateTimeFormat(locale,{timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit'}).format(new Date(entry.record.appointment.scheduled_start))}</time><strong>{entry.patient.name}</strong><button type="button" className="small-button" disabled={busy} onClick={()=>onOpen(entry.record,entry.patient)}><Video size={15}/>{t('current.m301')}</button></article>)}</div>:<p className={styles.emptyMeetings}>{t('current.m302')}</p>}</section>
 <p className={styles.historyHint}>{t('current.m303')}</p></div></div></main>;
}
