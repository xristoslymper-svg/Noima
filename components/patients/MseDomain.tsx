'use client';
import {mseItems,type DocumentField} from '@/lib/clinical/visit-document';
import {mseAxes,axisValues,toggleMseChoice,mseNote,replaceMseNote} from '@/lib/clinical/mse-options';
export default function MseDomain({field,previousField,referenceLabel,olderReference=false,pending=false,review=field.review,onKeep,onSkip,onContinue,onChange,onBlur}:{field:DocumentField;previousField?:DocumentField;referenceLabel?:string;olderReference?:boolean;pending?:boolean;review?:DocumentField['review'];onKeep?:()=>void;onSkip?:()=>void;onContinue?:()=>void;onChange:(text:string)=>void;onBlur:()=>void}){
 const changed=Boolean(!pending&&review!=='not_assessed'&&previousField&&field.text!==previousField.text);
 const hint=mseItems.find(([key])=>key===field.key)?.[2];
 const status=review==='not_assessed'?'Δεν αξιολογήθηκε':changed?'Άλλαξε':pending?(olderReference?'Παλαιότερη αναφορά':'Προηγούμενη καταγραφή'):previousField?.text.trim()?'Διατηρήθηκε':'';
 return <details data-mse-domain={field.key} className={'mse-item '+(field.text?'has-value ':'')+(changed?'mse-changed':'')}>
  <summary><span>{field.label}<b aria-hidden="true">⌄</b></span>{status&&<small className={changed?'mse-note-change':pending?'mse-pending':'mse-same'}>{status}</small>}</summary>
  <div className="mse-body">
   {referenceLabel&&<p className="mse-source-date">{referenceLabel}</p>}
   {(mseAxes[field.key]||[]).map(axis=><fieldset className="mse-axis" key={axis.label}><legend>{axis.label}{axis.multiple&&<small> · πολλαπλές επιλογές</small>}</legend><div className="mse-options">{axis.options.map(option=><button type="button" key={option} aria-pressed={axisValues(field.text,axis).includes(option)} onClick={()=>onChange(toggleMseChoice(field.text,axis,option))}>{option}</button>)}</div></fieldset>)}
   <label className="mse-note-label">{field.key==='mood'?'Διατύπωση ασθενούς / σημείωση':'Σημείωση'}<textarea aria-label={field.label+' — καταγραφή'} rows={2} value={mseNote(field.text,field.key)} onChange={e=>onChange(replaceMseNote(field.text,field.key,e.target.value))} onBlur={onBlur} placeholder="Προαιρετική περιγραφή…"/></label>
   {changed&&previousField&&<details className="mse-previous-text"><summary>Προηγούμενη καταγραφή</summary><p style={{whiteSpace:'pre-wrap'}}>{previousField.text}</p></details>}
   {onContinue&&<div className="mse-review-actions">
    {pending&&onKeep?<button type="button" onClick={onKeep}>Διατήρηση & συνέχεια</button>:field.text.trim()?<button type="button" onClick={onContinue}>Συνέχεια →</button>:null}
    {changed&&previousField&&<button type="button" className="mse-skip" onClick={()=>onChange(previousField.text)}>Επαναφορά προηγούμενων</button>}
    {onSkip&&review!=='not_assessed'&&<button type="button" className="mse-skip" onClick={onSkip}>Δεν αξιολογήθηκε</button>}
   </div>}
   {hint&&<details className="mse-guide-help"><summary>Οδηγός ενότητας</summary><p>{hint}</p>{field.key==='thought_content'&&<p>SI / HI: τεκμηρίωση στην ενότητα Κίνδυνος.</p>}</details>}
  </div>
 </details>;
}
