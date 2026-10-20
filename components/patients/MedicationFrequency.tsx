'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useOptionLabel} from '@/i18n/option-labels';

import {useTranslations} from 'next-intl';

import {medicationTimes,selectedMedicationTimes,toggleMedicationTime} from '@/lib/clinical/medication-frequency';

export default function MedicationFrequency({value,onChange,disabled,label}:{value:string;onChange:(value:string)=>void;disabled?:boolean;label?:string}){
 const ui=useUiText();

 const t=useTranslations();
 const displayLabel=useOptionLabel();
if (label === undefined) label=t('medications.frequency');


 const selected=selectedMedicationTimes(value);
 return <div className="med-frequency">
  <div role="group" aria-label={t('medications.dosingTimesPrefix')+label} className="med-frequency-times">
   {medicationTimes.map(time=><button key={time} type="button" aria-pressed={selected?.includes(time)||false} disabled={disabled||selected===null} onClick={()=>onChange(toggleMedicationTime(value,time))}>{displayLabel(time)}</button>)}
  </div>
  <input className="med-inline-input" aria-label={ui(label)} value={value} disabled={disabled} placeholder={t('medications.dosingInstructionsPlaceholder')} onChange={event=>onChange(event.target.value)}/>
  {selected===null&&<button className="med-frequency-reset" type="button" disabled={disabled} onClick={()=>onChange('')}>{t('medications.replaceWithDosingTimes')}</button>}
 </div>;
}
