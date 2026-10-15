'use client';
import {useLocale,useTranslations} from 'next-intl';
import type {Evidence} from '@/lib/clinical/summary-context';
import {formatClinicDateTime} from '@/lib/clinic-time';
import {useOptionLabel} from './option-labels';

// Build source-link captions from typed metadata, never by translating record text.
export function useEvidenceLabel(){
 const t=useTranslations(),locale=useLocale(),display=useOptionLabel();
 const labels:Record<string,string>={session_section:t('clinical.sourceLabels.session_section'),structured_risk:t('clinical.sourceLabels.structured_risk'),structured_medication:t('clinical.sourceLabels.structured_medication'),medication_event:t('clinical.sourceLabels.medication_event'),medication_revision:t('clinical.sourceLabels.medication_revision'),structured_side_effect:t('clinical.sourceLabels.structured_side_effect'),psychometric:t('clinical.sourceLabels.psychometric'),history:t('clinical.sourceLabels.history'),addendum:t('clinical.sourceLabels.addendum'),structured_correction:t('clinical.sourceLabels.structured_correction'),appointment:t('clinical.sourceLabels.appointment'),confirmed_context:t('clinical.sourceLabels.confirmed_context'),patient_context:t('clinical.sourceLabels.patient_context')};
 const sections:Record<string,string>={interview:'Ψυχιατρική συνέντευξη',mse:'MSE',assessment:'Κλινική εκτίμηση',plan:'Πλάνο',review:'Επανεκτίμηση',effects:'Παρενέργειες',functioning:'Λειτουργικότητα',adherence:'Λήψη αγωγής'};
 return (source:Evidence)=>{
  const content=(source.content&&typeof source.content==='object'?source.content:{}) as Record<string,unknown>;
  const detail=source.kind==='structured_medication'?content.medication_name:source.kind==='structured_side_effect'?content.effect_text:source.kind==='psychometric'?content.instrument:source.section_key?display(sections[source.section_key]||source.section_key):'';
  return [labels[source.kind]||t('clinical.recordEntry'),typeof detail==='string'?detail:'',source.date?formatClinicDateTime(source.date,locale):''].filter(Boolean).join(' · ');
 };
}
