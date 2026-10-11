'use client';
import Link from 'next/link';
import type {ClinicalCard} from '@/lib/clinical/clinical-card';
import {clinicalCardPreview} from '@/lib/clinical/clinical-card';
import type {BriefItem,PrevisitBriefing} from '@/lib/clinical/previsit-briefing';
import {formatClinicDate} from '@/lib/clinic-time';
import styles from './PrevisitBriefing.module.css';

/** Stable reading order; all facts and the compact safety status retain evidence. */
export default function PrevisitBriefingView({card,brief,patientId}:{card:ClinicalCard;brief:PrevisitBriefing;patientId:string}){
 const date=(value?:string|null)=>value?formatClinicDate(value):'';
 function sources(items:Pick<BriefItem,'source_ids'>[],label='Πηγές'){
  const evidence=[...new Set(items.flatMap(i=>i.source_ids))].map(id=>card.sources.find(s=>s.id===id)).filter(s=>s!==undefined);
  return evidence.length>0&&<details className={styles.sources}><summary>{label}</summary>{evidence.map(s=><Link key={s.id} href={'/patients/demo/'+encodeURIComponent(patientId)+'?tab='+s.target+(s.session_id?'&session='+encodeURIComponent(s.session_id):'')}>{s.label}</Link>)}</details>;
 }
 function row(label:string,items:BriefItem[],empty:string){return <li><strong>{label}:</strong> <span>{items.length?items.map((item,i)=><span className={styles.fact} key={i}>{item.text}{item.date&&item.date!==card.date&&<small> · καταγραφή {date(item.date)}</small>}{i<items.length-1?'; ':''}</span>):<span className={styles.empty}>{empty}</span>}</span>{sources(items)}</li>}
 function paragraphs(items:BriefItem[]){return items.map((item,i)=><p key={i}>{item.text}{item.date&&item.date!==card.date&&<small className={styles.sourceDate}>Καταγραφή {date(item.date)}</small>}</p>)}
 function reading(title:string,items:BriefItem[],budget:number,detail='Περισσότερα'){
  if(!items.length)return null;
  const {preview,rest}=clinicalCardPreview(items,budget);
  return <section className={styles.section}><h3>{title}</h3>{paragraphs(preview)}{rest.length>0&&<details className={styles.more}><summary>{detail}</summary>{paragraphs(rest)}</details>}{sources(items)}</section>;
 }
 const ideationLabel={yes:'Ναι',no:'Όχι',unknown:'Άγνωστο',not_assessed:'Δεν αξιολογήθηκε',missing:'Δεν έχει καταγραφεί',review:'Προς επιβεβαίωση'}[brief.ideation.value];
 const riskNotes=card.alerts.filter(f=>['risk','risk-note','risk-missing'].includes(f.key));
 const otherAlerts=card.alerts.filter(f=>!['risk','risk-note','risk-missing'].includes(f.key));
 const alertLabel=(key:string,label:string)=>key.startsWith('past-attempt:')?'Καταγεγραμμένο ιστορικό απόπειρας':key.startsWith('risk-review:')?'Ασυμφωνία πηγών κινδύνου — προς έλεγχο':key.startsWith('review:')?'PHQ-9 · εκκρεμεί έλεγχος λήμματος 9':key.startsWith('effect:')?'Καταγεγραμμένη παρενέργεια — προς έλεγχο':key==='history:allergies'?'Καταγεγραμμένες αλλεργίες':label;
 return <article className={styles.brief} aria-label="Σύντομη κλινική ενημέρωση" data-previsit-briefing="true">
  <ul className={styles.facts} aria-label="Διάγνωση, διαφορική και αγωγή">
   {row('ICD-10 / διάγνωση',brief.diagnoses,'Δεν έχει καταγραφεί.')}
   {row('Διαφορική',brief.differential,'Δεν έχει καταγραφεί.')}
   {row('Αγωγή',brief.medications,card.alerts.some(f=>f.key==='medication-refresh')?'Χρειάζεται ανανέωση των στοιχείων αγωγής.':'Δεν υπάρχει καταχωρισμένη ενεργή αγωγή.')}
  </ul>
  {reading('Καταγεγραμμένα στοιχεία & πορεία',brief.narrative,70)}
  {brief.narrativeSynthesized&&<p className={styles.meta}>Σύνθεση AI με πηγές · όχι επιβεβαιωμένο κλινικό συμπέρασμα.</p>}
  {reading('Σημαντικά θέματα για τη συνέχεια',brief.context,45)}
  {reading('Καταγεγραμμένο ιστορικό',brief.history,40,'Περισσότερο ιστορικό')}
  {brief.mse.length>0&&<section className={styles.section} data-brief-mse="true"><h3>Τελευταία καταγεγραμμένη εξέταση MSE</h3><p className={styles.meta}>{date(brief.mseDate)} · Ιστορικά ευρήματα, όχι σημερινή αξιολόγηση{brief.mseDate!==card.date?' · δεν επανεκτιμήθηκε στην τελευταία επίσκεψη.':'.'}</p>{paragraphs(clinicalCardPreview(brief.mse,55).preview)}{clinicalCardPreview(brief.mse,55).rest.length>0&&<details className={styles.more}><summary>Πλήρες MSE</summary>{paragraphs(clinicalCardPreview(brief.mse,55).rest)}</details>}{sources(brief.mse)}</section>}
  <section className={styles.safety} data-brief-risk={brief.ideation.value} aria-label="Αυτοκτονικός ιδεασμός">
   <p><strong>Αυτοκτονικός ιδεασμός:</strong> <span className={styles.status}>{ideationLabel}</span>{brief.ideation.qualifier&&<span> · {brief.ideation.qualifier}</span>}{brief.ideation.date&&<small> · {date(brief.ideation.date)}</small>}</p>
   <p className={styles.meta}>{brief.ideation.date?'Τελευταία ολοκληρωμένη επίσκεψη · όχι σημερινή εκτίμηση.':'Δεν υπάρχει ολοκληρωμένη καταγραφή κινδύνου.'}</p>
   {brief.safetyFlags.map((f,i)=><p className={styles.safetyFlag} key={i}>{f.text}</p>)}
   {(brief.ideation.source_ids.length>0||riskNotes.length>0)&&<details className={styles.more}><summary>Καταγραφή κινδύνου & πηγές</summary>{riskNotes.map(f=><p key={f.key}>{f.text}</p>)}{sources([brief.ideation,...riskNotes])}</details>}
  </section>
  {otherAlerts.length>0&&<section className={styles.section} aria-label="Σημεία προσοχής"><h3>Σημεία προς έλεγχο</h3>{otherAlerts.map(f=><details className={styles.attention} key={f.key}><summary>{alertLabel(f.key,f.label)}</summary><p>{f.text}</p>{sources([f])}</details>)}</section>}
  {card.notes.some(i=>i.role==='plan')&&<section className={styles.section}><details className={styles.more}><summary>Καταγεγραμμένο πλάνο & επανεκτίμηση</summary>{paragraphs(card.notes.filter(i=>i.role==='plan'))}{sources(card.notes.filter(i=>i.role==='plan'))}</details></section>}
  <p className={styles.meta}>{card.date?'Τελευταία ολοκληρωμένη επίσκεψη · '+date(card.date):'Δεν υπάρχει ολοκληρωμένη επίσκεψη.'}</p>
 </article>;
}
