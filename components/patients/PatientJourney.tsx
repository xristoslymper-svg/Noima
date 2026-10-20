'use client';
import {Plus,ClipboardCheck,CheckCircle2,ChevronDown,CalendarDays,Send,Video,FileClock} from 'lucide-react';
import {hasOlderDraft,clinicDay} from '@/lib/patients/patient-entry';
import {useEffect,useRef,useState} from 'react';
import type {DemoSession,PatientBundle} from '@/lib/patients/demo-runtime';
import {journeyExcerpt,journeyReview,latestJourneyNotes} from '@/lib/clinical/patient-journey';
import {formatClinicDateTime} from '@/lib/clinic-time';
import styles from './PatientJourney.module.css';
const date=(s:DemoSession)=>formatClinicDateTime(s.started_at);

export function JourneyOrientation({bundle,onVisit}:{bundle:PatientBundle;onVisit:(id:string)=>void}){
 const {visit,notes}=latestJourneyNotes(bundle);
 return <section className={styles.orientation} aria-label="Προσανατολισμός φακέλου"><div className={styles.heading}><div><span className="kicker">ΠΡΙΝ ΑΠΟ ΤΗΝ ΕΠΙΣΚΕΨΗ</span><h2>Κλινική σύνοψη</h2><p className={styles.meta}>{visit?'Τελευταία επιβεβαιωμένη επίσκεψη · '+date(visit):'Δεν υπάρχει ολοκληρωμένη επίσκεψη στο NOIMA.'}</p></div></div><dl className={styles.rows}><dt>Κλινική εικόνα</dt><dd>{notes?.clinical?journeyExcerpt(notes.clinical):'Δεν υπάρχει επιβεβαιωμένη καταγραφή. Οι απαντήσεις ασθενούς διακρίνονται από τη δική σας αξιολόγηση.'}</dd><dt>Απόφαση / πλάνο</dt><dd>{notes?.plan?journeyExcerpt(notes.plan):'Δεν έχει καταγραφεί θεραπευτική απόφαση σε ολοκληρωμένη επίσκεψη.'}</dd><dt>Επανεκτίμηση</dt><dd>{notes?.review?journeyExcerpt(notes.review):'Δείτε το πλάνο της τελευταίας επίσκεψης και καταγράψτε τη σημερινή εκτίμηση.'}</dd></dl>{visit&&<button type="button" className={styles.action} onClick={()=>onVisit(visit.id)}>Ανάγνωση προηγούμενης επίσκεψης</button>}<p className={styles.hint}>Αποσπάσματα επιβεβαιωμένων σημειώσεων με ημερομηνία. Η σημερινή εκτίμηση καταγράφεται στην επίσκεψη.</p></section>;
}
export function JourneyReference({bundle,session}:{bundle:PatientBundle;session:DemoSession}){
 const {visit,notes}=latestJourneyNotes(bundle,session);
 return <aside className={styles.reference} aria-label="Προηγούμενη επιβεβαιωμένη εικόνα"><details><summary><span>Προηγούμενη επίσκεψη</span><small>{visit?date(visit):'Χωρίς προηγούμενη καταγραφή'}</small></summary><div className={styles.referenceBody}><h3>{visit?'Τελευταία επιβεβαιωμένη εικόνα':'Πρώτη αξιολόγηση στο NOIMA'}</h3>{visit?<><p className={styles.meta}>{date(visit)} · ολοκληρωμένη</p><p>{journeyExcerpt(notes?.clinical||'Δεν υπάρχει διαθέσιμη κλινική σημείωση.',220)}</p><strong>Συμφωνημένος επανέλεγχος</strong><p>{notes?.review||notes?.plan||'Δεν έχει καταγραφεί.'}</p><details><summary>Προηγούμενες σημειώσεις</summary><p>{notes?.clinical||'Δεν υπάρχει διαθέσιμη σημείωση.'}</p><p>{notes?.plan}</p><p>{notes?.review}</p></details></>:<p>Το αρχικό ιστορικό και οι απαντήσεις ασθενούς είναι διαθέσιμα στον ίδιο φάκελο. Δεν αποτελούν προηγούμενη ολοκληρωμένη επίσκεψη.</p>}<p className={styles.hint}>Αναφορά μόνο για ανάγνωση. Καταγράψτε τη σημερινή έκβαση του επανελέγχου στην κλινική εικόνα και τις νέες αποφάσεις στο σημερινό πλάνο. Το MSE και ο κίνδυνος χρειάζονται τη σημερινή σας εκτίμηση.</p></div></details></aside>;
}
export function JourneyReview({bundle,session,busy,error,onBack,onConfirm}:{bundle:PatientBundle;session:DemoSession;busy:boolean;error?:string;onBack:()=>void;onConfirm:()=>void}){
 const review=journeyReview(bundle,session);
 return <section className={styles.review} aria-label="Έλεγχος πριν την ολοκλήρωση"><span className="kicker">ΕΛΕΓΧΟΣ ΚΑΤΑΓΡΑΦΗΣ</span><h2 className={styles.stateHeading}><ClipboardCheck size={24} aria-hidden="true"/>Πριν ολοκληρώσετε την επίσκεψη</h2><p className={styles.meta}>{date(session)} · {session.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επανεξέταση'} · αποθηκευμένο πρόχειρο</p><dl className={styles.rows}><dt>Κλινική εικόνα</dt><dd>{review.clinical||'Δεν υπάρχει ξεχωριστό κείμενο.'}</dd><dt>Απόφαση</dt><dd>{review.plan||'Δεν υπάρχει ξεχωριστό κείμενο.'}</dd><dt>Επανεκτίμηση</dt><dd>{review.review||'Περιλαμβάνεται στο επιβεβαιωμένο πλάνο.'}</dd></dl><p>Οι απαιτούμενες ενότητες και η εκτίμηση κινδύνου ελέγχθηκαν πριν ανοίξει αυτή η οθόνη και θα ελεγχθούν ξανά στην οριστικοποίηση.</p><div className={styles.saveBoundary}><strong>Ήδη καταχωρισμένα στον φάκελο</strong><p>{review.medicationWrites} αλλαγές αγωγής · {review.sideEffects} καταγραφές ανεπιθύμητων ενεργειών. Το αποθηκευμένο κλινικό ιστορικό ενημερώνει ήδη τον φάκελο. Τα αποθηκευμένα ραντεβού υπάρχουν ήδη στο ημερολόγιο. Παραμένουν ακόμη και αν συνεχίσετε την επίσκεψη αργότερα.</p></div>{error&&<p role="alert">{error}</p>}<div className={styles.actions}><button type="button" disabled={busy} onClick={onBack}>Επιστροφή στην καταγραφή</button><button type="button" disabled={busy} className={styles.primary} onClick={onConfirm}>{busy?'Οριστικοποίηση…':'Οριστικοποίηση επίσκεψης'}</button></div><p className={styles.hint}>Μετά την επιβεβαίωση από τον server η καταγραφή εμφανίζεται ολοκληρωμένη. Η αυτόματη κλινική σύνθεση μπορεί να χρειαστεί ανανέωση.</p></section>;
}
export function JourneyCompletion({session,onSummary,onRead}:{session:DemoSession;onSummary:()=>void;onRead:()=>void}){
 return <section className={styles.completion} aria-label="Ολοκλήρωση επίσκεψης"><span className="kicker">ΕΠΙΒΕΒΑΙΩΜΕΝΗ ΟΛΟΚΛΗΡΩΣΗ</span><h2 className={styles.stateHeading}><CheckCircle2 size={26} aria-hidden="true"/>Η επίσκεψη ολοκληρώθηκε</h2><p>{date(session)} · {session.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επανεξέταση'}</p><ul><li>Η καταγραφή επιβεβαιώθηκε ως ολοκληρωμένη και είναι διαθέσιμη στις Επισκέψεις.</li><li>Ο φάκελος ανανεώθηκε με τα επιβεβαιωμένα δεδομένα.</li><li>Η αγωγή και τα αποθηκευμένα ραντεβού παραμένουν στον φάκελο.</li></ul><div className={styles.actions}><button type="button" className={styles.primary} onClick={onSummary}>Επιστροφή στον ενημερωμένο φάκελο</button><button type="button" onClick={onRead}>Ανάγνωση καταγραφής</button></div></section>;
}

export function JourneyEntry({bundle,intended,disabled,onResume,onStart,onQuestionnaire,onTeleconsultation}:{bundle:PatientBundle;intended?:PatientBundle['appointments'][number];disabled:boolean;onResume:(id:string)=>void;onStart:(id?:string)=>void;onQuestionnaire?:()=>void;onTeleconsultation?:()=>void}){
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
 }}><button ref={trigger} type="button" className={'patient-voice-cta '+styles.actionsTrigger} aria-haspopup="menu" aria-expanded={open} aria-controls={'patient-actions-'+bundle.patient.id} disabled={disabled} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true)}}}>Ενέργειες <ChevronDown size={16} aria-hidden="true"/></button>
 {open&&<div className={styles.actionsMenu} role="menu" aria-label="Ενέργειες ασθενή" id={'patient-actions-'+bundle.patient.id}>
  <button type="button" role="menuitem" onClick={()=>choose(()=>onStart(intended?.id))}><Plus size={16} aria-hidden="true"/><span>Νέα επίσκεψη</span></button>
  <a role="menuitem" href={'/calendar?patient='+encodeURIComponent(bundle.patient.id)}><CalendarDays size={16} aria-hidden="true"/><span>Νέο ραντεβού</span></a>
  {onQuestionnaire&&<button type="button" role="menuitem" onClick={()=>choose(onQuestionnaire)}><Send size={16} aria-hidden="true"/><span>Αποστολή ερωτηματολογίου</span></button>}
  {onTeleconsultation&&<button type="button" role="menuitem" onClick={()=>choose(onTeleconsultation)}><Video size={16} aria-hidden="true"/><span>Έναρξη τηλεσυνεδρίας</span></button>}
  {drafts.length>0&&<><div role="separator" className={styles.actionsDivider}/><p className={styles.actionsCaption}>Μη ολοκληρωμένες σημειώσεις</p>{drafts.map(d=><button key={d.id} type="button" role="menuitem" onClick={()=>choose(()=>onResume(d.id))}><FileClock size={16} aria-hidden="true"/><span>Ολοκλήρωση σημειώσεων<small>{date(d)}</small></span></button>)}</>}
  {older&&<p className={styles.actionsHint}>Οι παλιές σημειώσεις διατηρούν την ημερομηνία τους. Η ανεξάρτητη νέα επίσκεψη δεν έχει ενεργοποιηθεί ακόμη σε αυτή τη δοκιμή.</p>}
  {!drafts.length&&appointments.length>1&&<p className={styles.actionsHint}>Στη νέα επίσκεψη θα επιλέξετε το σχετικό σημερινό ραντεβού.</p>}
 </div>}</div>;
}
