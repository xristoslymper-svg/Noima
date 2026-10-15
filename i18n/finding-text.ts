'use client';
import {useTranslations} from 'next-intl';
import type {Finding} from '@/lib/clinical/summary-context';

// These are deterministic review notices identified by stable source keys.
// All recorded narratives, quotes and previously generated prose remain intact.
export function useFindingText(){
 const t=useTranslations();
 return (finding:Pick<Finding,'key'|'text'>)=>{
  if(finding.key==='risk-missing')return t('clinical.missingRiskDisclaimer');
  if(finding.key==='medication-refresh')return t('medications.refreshRequired');
  if(finding.key.startsWith('risk-review:'))return t('clinical.riskSourceConflict');
  if(finding.key.startsWith('unstructured-med:'))return t('clinical.unstructuredDoseReview');
  return finding.text;
 };
}
