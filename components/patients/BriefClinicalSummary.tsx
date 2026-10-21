'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useTranslations,useLocale} from 'next-intl';
import {formatClinicDateTime} from '@/lib/clinic-time';
import PatientVisualIcon from './PatientVisualIcon';
import type {ClinicalCard,CardItem} from '@/lib/clinical/clinical-card';
import type {Finding} from '@/lib/clinical/summary-context';
import {briefPresentation,briefFacts,briefAlerts} from '@/lib/clinical/brief-presentation';
import styles from './PatientRecord.module.css';
import reading from './PatientReading.module.css';
export default function BriefClinicalSummary({card,patientId,findings,loading,onRefresh,statusText,generating=false,generatedAt,unavailable=false}:{generating?:boolean;generatedAt?:string;unavailable?:boolean;statusText?:string;card:ClinicalCard;patientId:string;findings?:Finding[];loading:boolean;onRefresh:()=>void}){
 const ui=useUiText();

 const t=useTranslations();
 const locale=useLocale();
 const facts=briefFacts(card);
 const alerts=briefAlerts(card);

 const synthesis=card.synthesized?(findings||[]).filter(f=>f.origin==='synthesis'):[];
 const items:CardItem[]=synthesis.length?synthesis:card.notes.flatMap(item=>Array.from(new Intl.Segmenter('el',{granularity:'sentence'}).segment(item.text),s=>({...item,text:s.segment.trim()})));
 const {preview,rest}=synthesis.length?{preview:items,rest:[]}:briefPresentation(items);
 const refs=[...items,...facts.diagnoses,...facts.differential,...facts.medications,...facts.review,...card.alerts];
 const sources=card.sources.filter(s=>refs.some(i=>i.source_ids.includes(s.id)));
 return <section className={styles.section} aria-label={t('current.m131')} data-summary-brief title={statusText}>
 <div className="panel-heading" data-summary-header><div><span className="kicker">{t('clinical.atAGlanceKicker')}</span><h2><PatientVisualIcon name="summary"/>{t('current.m131')}</h2></div><button type="button" className="patient-reported-link" data-summary-generate disabled={loading} onClick={onRefresh}>{generating?t('summaryBrief.generating'):loading?t('summaryBrief.checking'):card.synthesized?t('summaryBrief.refresh'):t('summaryBrief.create')}</button></div>
 {!synthesis.length&&<p role="status" className={styles.muted}>{generating?t('summaryBrief.generatingHelp'):unavailable?t('summaryBrief.failed'):loading?t('summaryBrief.checkingHelp'):t('summaryBrief.missing')}</p>}
 <div data-summary-facts>
 <div><strong>{t('summaryBrief.diagnosis')}</strong>{facts.diagnoses.length?facts.diagnoses.map((item,index)=><p key={index}>{item.text}</p>):<p>{t('summaryBrief.noDiagnosis')}</p>}{facts.differential.length>0&&<details data-summary-differential><summary>{t('summaryBrief.differential')}</summary>{facts.differential.map((item,index)=><p key={index}>{item.text}</p>)}</details>}</div>
 <div><strong>{t('summaryBrief.medication')}</strong>{facts.medications.length?facts.medications.map((item,index)=><p key={index}>{item.text}</p>):<p>{t('summaryBrief.noStructuredMedication')}</p>}</div>
 </div>
 {card.date&&<p className={styles.muted}>{t('summaryBrief.lastVisit',{date:formatClinicDateTime(card.date,locale)})}</p>}
 {preview.length?<div className={reading.briefText}>{preview.map((item,index)=><p key={index}>{item.text}</p>)}</div>:<p>{items.length?ui('Το διαθέσιμο κείμενο είναι εκτενές· ανοίξτε το παρακάτω για πλήρη ανάγνωση.'):ui('Δεν υπάρχει ακόμη ολοκληρωμένη κλινική καταγραφή για σύνοψη.')}</p>}
 {rest.length>0&&<details><summary>{synthesis.length?ui('Πλήρης σύνθεση'):ui('Περισσότερα αποσπάσματα')}</summary>{rest.map((item,index)=><p key={index}>{item.text}</p>)}</details>}
 {(alerts.visible.length>0||alerts.notes.length>0)&&<details data-summary-alerts><summary>{t('summaryBrief.sourceDetails')}</summary>{alerts.visible.map(item=><p key={item.key}>{item.text}</p>)}{alerts.notes.map(item=><p key={item.key}>{item.text}</p>)}</details>}
 {facts.review.length>0&&<div data-summary-review><strong>{t('summaryBrief.review')}</strong>{facts.review.map((item,index)=><p key={index}>{item.text}</p>)}</div>}
 <footer className={reading.briefFooter}>{synthesis.length>0&&<span role="status">{t('summaryBrief.verified')}{generatedAt?' · '+formatClinicDateTime(generatedAt,locale):''}</span>}<details><summary>{t('current.m132')}</summary>{sources.map(s=><a key={s.id} className="patient-reported-link" href={'/patients/demo/'+encodeURIComponent(patientId)+'?tab='+s.target+(s.session_id?'&session='+encodeURIComponent(s.session_id):'')+(s.kind==='psychometric'?'&assessment='+encodeURIComponent(s.record_id):'')}>{s.label}</a>)}</details><span>{t('summaryBrief.completedOnly')}</span></footer>
 </section>;
}
