'use client';
import {useFindingText} from '@/i18n/finding-text';
import {useOptionLabel} from '@/i18n/option-labels';
import {useEvidenceLabel} from '@/i18n/evidence-label';
import {useTranslations} from 'next-intl';

import {useLocale} from 'next-intl';

import Link from 'next/link';
import PrevisitBriefingView from './PrevisitBriefingView';
import ClinicalOrientationView from './ClinicalOrientationView';
import type {ClinicalCard,CardItem} from '@/lib/clinical/clinical-card';
import {clinicalCardPreview} from '@/lib/clinical/clinical-card';
import {formatClinicDateTime} from '@/lib/clinic-time';
import {overviewAttention} from '@/lib/overview/attention';

// Whole sentences only: long records stay available behind an explicit disclosure.
export default function ClinicalCardView({card,patientId,compact=false,overview=false}:{card:ClinicalCard;patientId:string;compact?:boolean;overview?:boolean}){
 const t=useTranslations();
 const findingText=useFindingText();
 const evidenceLabel=useEvidenceLabel();
 const displayLabel=useOptionLabel();

 const locale=useLocale();

 if((overview||compact)&&card.briefing)return <PrevisitBriefingView card={card} brief={card.briefing} patientId={patientId}/>;
 if(card.orientation&&!overview&&!compact)return <ClinicalOrientationView card={card} patientId={patientId}/>;
 const comparison=clinicalCardPreview(card.changeSummary,compact?35:60);
 const attention=overview?overviewAttention(card):null;
 function attentionGroup(title:string,items:ClinicalCard['alerts'],secondary=false){
  return items.length>0&&<section className="clinical-card-attention" style={secondary?{background:'transparent',borderLeftColor:'#8b9d8e',color:'#435c4d'}:undefined} aria-label={title}><strong>{title}</strong>{items.map(f=><div key={f.key}><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{findingText(f)}</p>{sourceLinks([f])}</div>)}</section>;
 }
 function sourceLinks(items:CardItem[]){const ids=[...new Set(items.flatMap(i=>i.source_ids))];return ids.length>0&&<details className="clinical-card-sources"><summary>{t('clinical.sources')}</summary>{ids.map(id=>{const s=card.sources.find(s=>s.id===id);return s?<Link key={id} href={'/patients/demo/'+patientId+'?tab='+(s.kind==='prior_course'?'timeline':s.target)+(s.session_id?'&session='+s.session_id:'')}>{evidenceLabel(s)}</Link>:null})}</details>}
 function block(title:string,items:CardItem[],empty:string,budget:number){
  const {preview,rest}=clinicalCardPreview(items,budget);
  return <section className="clinical-card-section"><h3>{title}</h3>{preview.map((item,i)=><p key={i}>{item.text}</p>)}{!items.length&&<p className="clinical-card-empty">{empty}</p>}{rest.length>0&&<details className="clinical-card-details"><summary>{preview.length?t('common.more'):t('visits.openRecord')} · {rest.length}</summary>{rest.map((item,i)=><p key={i}>{item.text}</p>)}</details>}{!compact&&sourceLinks(items)}</section>;
 }
 return <div className={'clinical-card'+(compact?' clinical-card-compact':'')}>
  <p className="clinical-card-date">{card.date?t('visits.lastCompletedPrefix')+formatClinicDateTime(card.date, locale):t('visits.noCompletedVisit')}</p>
  {!overview&&card.alerts.length>0&&<section className="clinical-card-attention" aria-label={t('clinical.attentionPoints')}><strong>{t('clinical.attentionRequired')}</strong>{card.alerts.map(f=><details key={f.key}><summary>{displayLabel(f.label)} · {findingText(f).split(/(?<=[.!?])\s/u)[0]}</summary><p>{findingText(f)}</p>{sourceLinks([f])}</details>)}</section>}
  {attention&&<>
   {attentionGroup(t('clinical.findingsForReview'),attention.concern)}
   {attentionGroup(t('clinical.notesPendingChecks'),attention.review)}
   {block(t('clinical.courseNextStep'),card.notes,t('clinical.noCoursePlan'),90)}
   {card.notes.length>0&&<p className="clinical-card-date">{card.synthesized?t('clinical.aiSynthesisDisclaimer'):t('clinical.verbatimClinicianEntries')}</p>}
   {sourceLinks(card.notes)}
   {attentionGroup(t('clinical.incompleteAssessment'),attention.incomplete,true)}
   {attentionGroup(t('clinical.importantHistoryDisclaimer'),attention.history,true)}
  </>}
  {card.context?.length>0&&block(t('clinical.keyOpenIssues'),card.context,'',compact?35:75)}
  <div className="clinical-card-grid">
   {block(t('clinical.diagnosis'),card.diagnoses,t('clinical.noStructuredDiagnosis'),compact?18:30)}
   {block(t('medications.current'),card.medications,t('medications.noActiveMedication'),compact?18:30)}
  </div>
  {block(t('clinical.mentalStatus'),card.mse,t('clinical.noLatestMse'),compact?18:45)}
  {comparison.preview.map((item,i)=><p className="clinical-card-change" key={i}>{item.text}</p>)}
  {comparison.rest.length>0&&<details className="clinical-card-details"><summary>{t('clinical.moreChangesPrefix')} {comparison.rest.length}</summary>{comparison.rest.map((item,i)=><p key={i}>{item.text}</p>)}</details>}
  {!compact&&card.changes.length>0&&<details className="clinical-card-details"><summary>{t('clinical.changesSincePrevious')}</summary>{card.changes.map((i,n)=><p key={n}>{i.text}</p>)}{sourceLinks(card.changes)}</details>}
   {!overview&&block(t('clinical.courseNextStep'),card.notes,t('clinical.noCoursePlan'),card.synthesized?90:compact?30:65)}
  {!overview&&!card.synthesized&&card.notes.length>0&&<small className="clinical-card-date">{t('clinical.verbatimClinicianEntries')}</small>}
  {!compact&&card.corrections.length>0&&<details className="clinical-card-details"><summary>{t('visits.correctionHistoryPrefix')} {card.corrections.length}</summary>{card.corrections.map(f=><p key={f.key}>{findingText(f)}</p>)}{sourceLinks(card.corrections)}</details>}
  <style jsx global>{`.clinical-card{color:#293e35;background:#f8fbf8;border:1px solid #e2eae4;border-radius:18px;padding:24px;line-height:1.65}.clinical-card-date{margin:0 0 18px;color:#728278;font-size:11px}.clinical-card-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.clinical-card-section{padding:14px 0;border-top:1px solid #e4ebe5;min-width:0}.clinical-card-section h3{font-size:12px;font-weight:700;color:#667b6f;margin:0 0 8px}.clinical-card-section p,.clinical-card-details p{font-size:14px;line-height:1.7;margin:0 0 7px;white-space:pre-wrap;overflow-wrap:anywhere}.clinical-card-empty{color:#7d8982!important;font-size:12px!important}.clinical-card-sources{font-size:10px;color:#768b7e}.clinical-card-sources summary,.clinical-card-details summary{cursor:pointer}.clinical-card-sources a{display:block;color:#476b59;margin-top:5px}.clinical-card-change{font-size:12px;color:#55765f;margin:0 0 6px}.clinical-card-details{font-size:12px;color:#587562;margin:7px 0}.clinical-card-details p{color:#293e35;margin-top:10px}.clinical-card-attention{border-left:3px solid #b78a49;background:#fff8ea;border-radius:8px;padding:10px 13px;margin-bottom:17px;font-size:12px;color:#745424}.clinical-card-attention strong{display:block;margin-bottom:5px}.clinical-card-attention details{margin:5px 0}.clinical-card-attention summary{cursor:pointer}.clinical-card-compact{padding:15px;border-radius:13px}.clinical-card-compact .clinical-card-date{font-size:10px;margin-bottom:10px}.clinical-card-compact .clinical-card-grid{grid-template-columns:1fr;gap:0}.clinical-card-compact .clinical-card-section{padding:9px 0}.clinical-card-compact .clinical-card-section p{font-size:12px;line-height:1.55}.clinical-card-compact .clinical-card-section h3{font-size:10px;margin-bottom:4px}@media(max-width:700px){.clinical-card-grid{grid-template-columns:1fr;gap:0}.clinical-card{padding:18px}.clinical-card-compact{padding:13px}}`}</style>
 </div>;
}
