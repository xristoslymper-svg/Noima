'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useTranslations} from 'next-intl';
import {isCustomSection,readCustomSection} from '@/lib/clinical/visit-layout';
import {Plus,ClipboardCheck,CheckCircle2,ChevronDown,CalendarDays,Send,Video,FileClock} from 'lucide-react';
import {hasOlderDraft,clinicDay} from '@/lib/patients/patient-entry';
import {useEffect,useRef,useState} from 'react';
import type {DemoSession,PatientBundle} from '@/lib/patients/demo-runtime';
import {journeyExcerpt,journeyReview,latestJourneyNotes} from '@/lib/clinical/patient-journey';
import {formatClinicDateTime} from '@/lib/clinic-time';
import styles from './PatientJourney.module.css';
const date=(s:DemoSession)=>formatClinicDateTime(s.started_at);

export function JourneyOrientation({bundle,onVisit}:{bundle:PatientBundle;onVisit:(id:string)=>void}){
 const ui=useUiText();

 const t=useTranslations();

 const {visit,notes}=latestJourneyNotes(bundle);
 return <section className={styles.orientation} aria-label={t('current.m162')}><div className={styles.heading}><div><span className="kicker">{t('current.m134')}</span><h2>{t('current.m131')}</h2><p className={styles.meta}>{visit?ui('Τελευταία επιβεβαιωμένη επίσκεψη · ')+date(visit):ui('Δεν υπάρχει ολοκληρωμένη επίσκεψη στο NOIMA.')}</p></div></div><dl className={styles.rows}><dt>{t('clinical.currentState')}</dt><dd>{notes?.clinical?journeyExcerpt(notes.clinical):ui('Δεν υπάρχει επιβεβαιωμένη καταγραφή. Οι απαντήσεις ασθενούς διακρίνονται από τη δική σας αξιολόγηση.')}</dd><dt>{t('current.m135')}</dt><dd>{notes?.plan?journeyExcerpt(notes.plan):ui('Δεν έχει καταγραφεί θεραπευτική απόφαση σε ολοκληρωμένη επίσκεψη.')}</dd><dt>{t('clinical.review')}</dt><dd>{notes?.review?journeyExcerpt(notes.review):ui('Δείτε το πλάνο της τελευταίας επίσκεψης και καταγράψτε τη σημερινή εκτίμηση.')}</dd></dl>{visit&&<button type="button" className={styles.action} onClick={()=>onVisit(visit.id)}>{t('current.m136')}</button>}<p className={styles.hint}>{t('current.m137')}</p></section>;
}
export function JourneyReference({bundle,session}:{bundle:PatientBundle;session:DemoSession}){
 const ui=useUiText();

 const t=useTranslations();

 const {visit,notes}=latestJourneyNotes(bundle,session);
 return <aside className={styles.reference} aria-label={t('current.m163')}><details><summary><span>{t('visits.previousVisit')}</span><small>{visit?date(visit):ui('Χωρίς προηγούμενη καταγραφή')}</small></summary><div className={styles.referenceBody}><h3>{visit?ui('Τελευταία επιβεβαιωμένη εικόνα'):ui('Πρώτη αξιολόγηση στο NOIMA')}</h3>{visit?<><p className={styles.meta}>{date(visit)} {t('polish.m036')}</p><p>{journeyExcerpt(notes?.clinical||ui('Δεν υπάρχει διαθέσιμη κλινική σημείωση.'),220)}</p><strong>{t('current.m138')}</strong><p>{notes?.review||notes?.plan||ui('Δεν έχει καταγραφεί.')}</p><details><summary>{t('current.m139')}</summary><p>{notes?.clinical||ui('Δεν υπάρχει διαθέσιμη σημείωση.')}</p><p>{notes?.plan}</p><p>{notes?.review}</p></details></>:<p>{t('current.m140')}</p>}<p className={styles.hint}>{t('current.m141')}</p></div></details></aside>;
}
export function JourneyReview({bundle,session,busy,error,onBack,onConfirm}:{bundle:PatientBundle;session:DemoSession;busy:boolean;error?:string;onBack:()=>void;onConfirm:()=>void}){
 const ui=useUiText();

 const t=useTranslations();

 const review=journeyReview(bundle,session);
 return <section className={styles.review} aria-label={t('current.m164')}><span className="kicker">{t('current.m142')}</span><h2 className={styles.stateHeading}><ClipboardCheck size={24} aria-hidden="true"/>{t('current.m143')}</h2><p className={styles.meta}>{date(session)} · {session.session_type==='initial_assessment'?ui('Αρχική αξιολόγηση'):ui('Επανεξέταση')} {t('polish.m037')}</p><dl className={styles.rows}><dt>{t('clinical.currentState')}</dt><dd>{review.clinical||ui('Δεν υπάρχει ξεχωριστό κείμενο.')}</dd><dt>{t('current.m144')}</dt><dd>{review.plan||ui('Δεν υπάρχει ξεχωριστό κείμενο.')}</dd><dt>{t('clinical.review')}</dt><dd>{review.review||ui('Δεν έχει καταγραφεί.')}</dd></dl>{bundle.sections.filter(s=>s.session_id===session.id&&isCustomSection(s.section_key)).map(s=>{const value=readCustomSection(s.content);return <div key={s.id}><h3>{value.title}</h3><p style={{whiteSpace:'pre-wrap'}}>{value.body||ui('Δεν έχει καταγραφεί κείμενο.')}</p></div>})}<p>{t('current.m145')}</p><div className={styles.saveBoundary}><strong>{t('current.m146')}</strong><p>{review.medicationWrites} {t('polish.m038')} {review.sideEffects} {t('polish.m039')}</p></div>{error&&<p role="alert">{ui(error)}</p>}<div className={styles.actions}><button type="button" disabled={busy} onClick={onBack}>{t('current.m147')}</button><button type="button" disabled={busy} className={styles.primary} onClick={onConfirm}>{busy?ui('Καταχώριση…'):ui('Καταχώριση επίσκεψης')}</button></div><p className={styles.hint}>{t('current.m148')}</p></section>;
}
export function JourneyCompletion({session,onSummary,onRead}:{session:DemoSession;onSummary:()=>void;onRead:()=>void}){
 const ui=useUiText();

 const t=useTranslations();

 return <section className={styles.completion} aria-label={t('current.m165')}><span className="kicker">{t('current.m149')}</span><h2 className={styles.stateHeading}><CheckCircle2 size={26} aria-hidden="true"/>{t('current.m150')}</h2><p>{date(session)} · {session.session_type==='initial_assessment'?ui('Αρχική αξιολόγηση'):ui('Επανεξέταση')}</p><ul><li>{t('current.m151')}</li><li>{t('current.m152')}</li><li>{t('current.m153')}</li></ul><div className={styles.actions}><button type="button" className={styles.primary} onClick={onSummary}>{t('current.m154')}</button><button type="button" onClick={onRead}>{t('current.m155')}</button></div></section>;
}

export function JourneyEntry({bundle,intended,disabled,onResume,onStart,onQuestionnaire,onTeleconsultation,onAppointment}:{bundle:PatientBundle;intended?:PatientBundle['appointments'][number];disabled:boolean;onResume:(id:string)=>void;onStart:(id?:string)=>void;onQuestionnaire?:()=>void;onTeleconsultation?:()=>void;onAppointment?:()=>void}){
 const t=useTranslations();

 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const drafts=bundle.sessions.filter(s=>s.status==='draft');
 const older=hasOlderDraft(drafts);
 const appointments=bundle.appointments.filter(a=>a.status==='scheduled'&&clinicDay(a.scheduled_start)===clinicDay(new Date().toISOString()));
 useEffect(()=>{
  if(!open)return;
  const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};
  root.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);
 },[open]);
 const choose=(action:()=>void)=>{setOpen(false);action()};
 return <div ref={root} className={styles.patientActions} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus()}
  if(open&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();const items=Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')||[]);
   const index=items.indexOf(document.activeElement as HTMLElement);const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();
  }
 }}><button ref={trigger} type="button" className={'patient-voice-cta '+styles.actionsTrigger} aria-haspopup="menu" aria-expanded={open} aria-controls={'patient-actions-'+bundle.patient.id} disabled={disabled} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true)}}}>{t('common.actions')}<ChevronDown size={16} aria-hidden="true"/></button>
 {open&&<div className={styles.actionsMenu} role="menu" aria-label={t('current.m166')} id={'patient-actions-'+bundle.patient.id}>
  <button type="button" role="menuitem" onClick={()=>choose(()=>onStart(intended?.id))}><Plus size={16} aria-hidden="true"/><span>{t('current.m156')}</span></button>
  {onAppointment&&<button type="button" role="menuitem" onClick={()=>choose(onAppointment)}><CalendarDays size={16} aria-hidden="true"/><span>{t('calendar.newAppointment')}</span></button>}
  {onQuestionnaire&&<button type="button" role="menuitem" onClick={()=>choose(onQuestionnaire)}><Send size={16} aria-hidden="true"/><span>{t('psychometrics.sendQuestionnaire')}</span></button>}
  {onTeleconsultation&&<button type="button" role="menuitem" onClick={()=>choose(onTeleconsultation)}><Video size={16} aria-hidden="true"/><span>{t('current.m157')}</span></button>}
  {drafts.length>0&&<><div role="separator" className={styles.actionsDivider}/><p className={styles.actionsCaption}>{t('current.m158')}</p>{drafts.map(d=><button key={d.id} type="button" role="menuitem" onClick={()=>choose(()=>onResume(d.id))}><FileClock size={16} aria-hidden="true"/><span>{t('current.m159')}<small>{date(d)}</small></span></button>)}</>}
  {older&&<p className={styles.actionsHint}>{t('current.m160')}</p>}
  {!drafts.length&&appointments.length>1&&<p className={styles.actionsHint}>{t('current.m161')}</p>}
 </div>}</div>;
}
