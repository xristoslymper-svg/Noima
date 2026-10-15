'use client';
import {useTranslations} from 'next-intl';

import {type DocumentField} from '@/lib/clinical/visit-document';
import {mseAxes,axisValues,toggleMseChoice,mseNote,replaceMseNote} from '@/lib/clinical/mse-options';
import {mseDomainLabel,mseRecordedPreview} from '@/lib/clinical/mse-presentation';
export default function MseDomain({field,previousField,referenceLabel,olderReference=false,pending=false,review=field.review,onKeep,onSkip,onContinue,onChange,onBlur}:{field:DocumentField;previousField?:DocumentField;referenceLabel?:string;olderReference?:boolean;pending?:boolean;review?:DocumentField['review'];onKeep?:()=>void;onSkip?:()=>void;onContinue?:()=>void;onChange:(text:string)=>void;onBlur:()=>void}){
 const t=useTranslations();

 const changed=Boolean(!pending&&review!=='not_assessed'&&previousField&&field.text!==previousField.text);
 const status=review==='not_assessed'?'':changed?t('clinical.changed'):pending?(olderReference?t('clinical.olderReference'):t('clinical.previousEntry')):previousField?.text.trim()?t('clinical.retained'):'';
 const label=mseDomainLabel(field),preview=review==='not_assessed'?'':mseRecordedPreview(field);
 return <details data-mse-domain={field.key} className={'mse-item '+(preview?'has-value ':'')+(changed?'mse-changed':'')}>
  <summary><span className="mse-domain-name">{label}</span><span className={'mse-domain-preview'+(preview?'':' mse-empty')} title={preview||undefined}>{preview}</span>{status&&<small className={'mse-domain-status '+(changed?'mse-note-change':pending?'mse-pending':'mse-same')}>{status}</small>}<b className="mse-chevron" aria-hidden="true">⌄</b></summary>
  <div className="mse-body">
   {referenceLabel&&<p className="mse-source-date">{referenceLabel}</p>}
   {(mseAxes[field.key]||[]).map(axis=><fieldset className="mse-axis" key={axis.label}><legend>{axis.label}{axis.multiple&&<small>  {t('clinical.multipleChoiceSuffix')}</small>}</legend><div className="mse-options">{axis.options.map(option=><button type="button" key={option} aria-pressed={axisValues(field.text,axis).includes(option)} onClick={()=>onChange(toggleMseChoice(field.text,axis,option))}>{option}</button>)}</div></fieldset>)}
   <label className="mse-note-label">{field.key==='mood'?t('clinical.patientWordingNote'):t('clinical.note')}<textarea aria-label={label+t('clinical.entrySuffix')} rows={2} value={review==='not_assessed'&&field.text==='Δεν αξιολογήθηκε σήμερα'?'':mseNote(field.text,field.key)} onChange={e=>onChange(replaceMseNote(field.text,field.key,e.target.value))} onBlur={onBlur} placeholder={t('clinical.optionalDescription')}/></label>
   {changed&&previousField&&<details className="mse-previous-text"><summary>{t('clinical.previousEntry')}</summary><p style={{whiteSpace:'pre-wrap'}}>{previousField.text}</p></details>}
   {onContinue&&<div className="mse-review-actions">
    {pending&&onKeep?<button type="button" onClick={onKeep}>{t('clinical.keepAndContinue')}</button>:preview?<button type="button" onClick={onContinue}>{t('common.continueArrow')}</button>:null}
    {changed&&previousField&&<button type="button" className="mse-skip" onClick={()=>onChange(previousField.text)}>{t('clinical.restorePrevious')}</button>}
    {onSkip&&review!=='not_assessed'&&Boolean(field.text.trim())&&<button type="button" className="mse-clear" aria-label={t('accessibility.clearSelectionsPrefix')+label} title={t('clinical.clearTodaySelections')} onClick={onSkip}><span aria-hidden="true">×</span></button>}
   </div>}
  </div>
 </details>;
}
