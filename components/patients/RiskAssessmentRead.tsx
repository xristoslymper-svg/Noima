import {useOptionLabel} from '@/i18n/option-labels';

import {useTranslations} from 'next-intl';
import type {DemoRisk} from '@/lib/patients/demo-runtime';
import {riskFindings,riskFindingLabel} from '@/lib/clinical/risk-findings';
export default function RiskAssessmentRead({risk}:{risk:Partial<DemoRisk>|null|undefined}){
 const t=useTranslations();
 const displayLabel=useOptionLabel();

 return <div className="risk-assessment-read">{risk?<><ul>{riskFindings(risk).map(f=><li key={f.key}>{f.previousBranch&&<small>{t('clinical.previousBranchReview')}<br/></small>}{displayLabel(f.label)}<br/><strong>{displayLabel(riskFindingLabel(f))}</strong>{f.note&&<p>{f.note}</p>}</li>)}</ul>{risk.protective_factors&&<p>{t('clinical.protectiveFactorsPrefix')} {risk.protective_factors}</p>}{risk.clinical_note&&<p>{t('clinical.riskAppraisalActionsPrefix')} {risk.clinical_note}</p>}</>:<p>{t('clinical.noCurrentAssessment')}</p>}</div>;
}
