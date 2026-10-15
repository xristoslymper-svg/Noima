'use client';
import {useOptionLabel} from '@/i18n/option-labels';
import {useTranslations} from 'next-intl';

import {useLocale} from 'next-intl';

import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {assessmentLinkLabel} from '@/lib/clinical/assessment-link';
import {visitScoreComparisons} from '@/lib/clinical/visit-scores';
import {formatClinicDate} from '@/lib/clinic-time';
import PatientPsychometrics from './PatientPsychometrics';
export default function VisitScores({bundle,sessionId,reload}:{bundle:PatientBundle;sessionId:string;reload:()=>Promise<unknown>}){
 const t=useTranslations();
 const displayLabel=useOptionLabel();

 const locale=useLocale();

 const comparisons=visitScoreComparisons(bundle,sessionId);
 return <div className="visit-scores"><div className="clinical-table-wrap"><table className="clinical-lean-table score-comparison"><caption>{t('psychometrics.previousVisitComparison')}</caption><thead><tr><th>{t('psychometrics.instrument')}</th><th>{t('visits.previousVisit')}</th><th>{t('visits.thisVisit')}</th><th>{t('psychometrics.change')}</th></tr></thead><tbody>{comparisons.map(c=><tr key={c.instrument}><th scope="row">{c.instrument}</th><td>{c.prior?<><strong>{c.prior.score}</strong><small>{formatClinicDate(c.prior.completed_at!, locale)}</small><small>{assessmentLinkLabel(bundle,c.prior,displayLabel)}</small></>:<small>{c.previous?t('psychometrics.noLinkedMeasure'):t('visits.noPreviousVisit')}</small>}</td><td>{c.current?<><strong>{c.current.score}</strong><small>{formatClinicDate(c.current.completed_at!, locale)}</small><small>{assessmentLinkLabel(bundle,c.current,displayLabel)}</small></>:<small>{t('psychometrics.noLinkedMeasure')}</small>}</td><td>{c.delta!==null?<strong>{c.delta>0?'+':''}{c.delta}</strong>:<small>{c.current&&c.prior?t('psychometrics.differentVersions'):'—'}</small>}</td></tr>)}</tbody></table></div><details className="visit-score-history"><summary>{t('psychometrics.assignmentsHistory')}</summary><PatientPsychometrics bundle={bundle} reload={reload} sessionId={sessionId}/></details></div>;
}
