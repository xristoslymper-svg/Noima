
import {useTranslations} from 'next-intl';

import {useLocale} from 'next-intl';
import type {mseTimeline} from '@/lib/clinical/visit-workspace-state';
import {formatClinicDateTime} from '@/lib/clinic-time';

export default function MseTimeline({timeline}:{timeline:ReturnType<typeof mseTimeline>}){
 const t=useTranslations();

 const locale=useLocale();

 return <details className="mse-timeline"><summary>{t('clinical.mseTimelinePrefix')} {timeline.visits.length}  {t('visits.previousVisitsSuffix')}</summary><p>{t('clinical.mseTimelineHelp')}</p>{timeline.visits.length?timeline.visits.map((visit,index)=><article key={visit.sessionId}><h4>{index===0?t('visits.firstRecordedVisit'):t('visits.visitPrefix')+(index+1)} · {formatClinicDateTime(visit.date, locale)}</h4>{visit.corrections.length>0&&<details><summary>{t('visits.includesPrefix')} {visit.corrections.length}  {t('visits.correctionsSuffix')}</summary>{visit.corrections.map(c=><p key={c.id}>{formatClinicDateTime(c.created_at, locale)} · {c.reason}</p>)}</details>}{visit.fields.length?<dl>{visit.fields.map(field=><div key={field.key}><dt>{field.label} <span>{field.state==='changed'?t('common.change'):field.state==='same'?t('clinical.sameEntry'):field.state==='first'?t('clinical.recordEntry'):field.state==='not_assessed'?t('clinical.notEvaluated'):t('clinical.notRecordedThisVisit')}</span></dt><dd>{field.state==='changed'?<><del>{field.before}</del><span aria-label={t('clinical.changedTo')}> → </span><strong>{field.text}</strong></>:field.text||t('clinical.previousHistoricalOnly')}</dd></div>)}</dl>:!visit.narrative&&<p>{t('clinical.noStructuredMseThisVisit')}</p>}{visit.narrative&&<details><summary>{t('clinical.narrativeEntry')}</summary><p className="mse-timeline-text">{visit.narrative}</p></details>}{visit.addenda.map(a=><details key={a.id}><summary>{a.kind==='correction'?t('clinical.narrativeCorrectionReview'):t('common.add')} · {formatClinicDateTime(a.created_at, locale)}</summary><p className="mse-timeline-text">{a.content}</p></details>)}</article>):<p>{t('visits.noPreviousCompleted')}</p>}</details>;
}
