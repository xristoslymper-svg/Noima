'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useTranslations} from 'next-intl';
import PatientVisualIcon from './PatientVisualIcon';
import type {ClinicalCard,CardItem} from '@/lib/clinical/clinical-card';
import type {Finding} from '@/lib/clinical/summary-context';
import {briefPresentation} from '@/lib/clinical/brief-presentation';
import styles from './PatientRecord.module.css';
import reading from './PatientReading.module.css';
export default function BriefClinicalSummary({card,patientId,findings,loading,onRefresh,statusText}:{statusText?:string;card:ClinicalCard;patientId:string;findings?:Finding[];loading:boolean;onRefresh:()=>void}){
 const ui=useUiText();

 const t=useTranslations();

 const synthesis=card.synthesized?(findings||[]).filter(f=>f.origin==='synthesis'):[];
 const items:CardItem[]=synthesis.length?synthesis:card.notes.flatMap(item=>Array.from(new Intl.Segmenter('el',{granularity:'sentence'}).segment(item.text),s=>({...item,text:s.segment.trim()})));
 const {preview,rest}=briefPresentation(items);
 const sources=card.sources.filter(s=>items.some(i=>i.source_ids.includes(s.id)));
 return <section className={styles.section} aria-label={t('current.m131')}>
 <div className="panel-heading"><div><span className="kicker">{t('clinical.atAGlanceKicker')}</span><h2><PatientVisualIcon name="summary"/>{t('current.m131')}</h2></div></div>
 {!synthesis.length&&<p role="status" className={styles.muted}>{statusText||(loading?ui('Φόρτωση σύνθεσης · προσωρινά εμφανίζονται αποσπάσματα φακέλου.'):ui('Σύντομα αποσπάσματα φακέλου · η σύνθεση δεν είναι διαθέσιμη.'))}</p>}
 {preview.length?<div className={reading.briefText}>{preview.map((item,index)=><p key={index}>{item.text}</p>)}</div>:<p>{items.length?ui('Το διαθέσιμο κείμενο είναι εκτενές· ανοίξτε το παρακάτω για πλήρη ανάγνωση.'):ui('Δεν υπάρχει ακόμη ολοκληρωμένη κλινική καταγραφή για σύνοψη.')}</p>}
 {rest.length>0&&<details><summary>{synthesis.length?ui('Πλήρης σύνθεση'):ui('Περισσότερα αποσπάσματα')}</summary>{rest.map((item,index)=><p key={index}>{item.text}</p>)}</details>}
 <footer className={reading.briefFooter}><details><summary>{t('current.m132')}</summary>{sources.map(s=><a key={s.id} className="patient-reported-link" href={'/patients/demo/'+encodeURIComponent(patientId)+'?tab='+s.target+(s.session_id?'&session='+encodeURIComponent(s.session_id):'')+(s.kind==='psychometric'?'&assessment='+encodeURIComponent(s.record_id):'')}>{s.label}</a>)}</details><button type="button" className="patient-reported-link" disabled={loading} onClick={onRefresh}>{t('current.m133')}</button></footer>
 </section>;
}
