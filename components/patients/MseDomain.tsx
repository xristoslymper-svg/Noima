'use client';
import {type DocumentField} from '@/lib/clinical/visit-document';
import {mseAxes,axisValues,toggleMseChoice,mseNote,replaceMseNote} from '@/lib/clinical/mse-options';
import {mseDomainLabel,mseRecordedPreview} from '@/lib/clinical/mse-presentation';
export default function MseDomain({field,previousField,referenceLabel,olderReference=false,pending=false,review=field.review,onKeep,onContinue,onChange,onBlur}:{field:DocumentField;previousField?:DocumentField;referenceLabel?:string;olderReference?:boolean;pending?:boolean;review?:DocumentField['review'];onKeep?:()=>void;onContinue?:()=>void;onChange:(text:string)=>void;onBlur:()=>void}){
 // The editor shows today's observations only. Historical references are separate.
 const text=review==='not_assessed'?'':field.text;
 const changed=Boolean(text.trim()&&!pending&&previousField&&text!==previousField.text);
 const status=changed?'Άλλαξε':text.trim()&&previousField?.text.trim()?'Διατηρήθηκε':'';
 const label=mseDomainLabel(field),preview=mseRecordedPreview({...field,text});
 return <details data-mse-domain={field.key} className={'mse-item '+(text.trim()?'has-value ':'')+(changed?'mse-changed':'')}>
  <summary><span className="mse-domain-name">{label}</span><span className={'mse-domain-preview'+(preview?'':' mse-empty')} title={preview||undefined}>{preview||'—'}</span>{status&&<small className={'mse-domain-status '+(changed?'mse-note-change':pending?'mse-pending':'mse-same')}>{status}</small>}<b className="mse-chevron" aria-hidden="true">⌄</b></summary>
  <div className="mse-body">
   {referenceLabel&&<p className="mse-source-date">{referenceLabel}</p>}
   {(mseAxes[field.key]||[]).map(axis=><fieldset className="mse-axis" key={axis.label}><legend>{axis.label}{axis.multiple&&<small> · πολλαπλές επιλογές</small>}</legend><div className="mse-options">{axis.options.map(option=><button type="button" key={option} aria-pressed={axisValues(text,axis).includes(option)} onClick={()=>onChange(toggleMseChoice(text,axis,option))}>{option}</button>)}</div></fieldset>)}
   <label className="mse-note-label">{field.key==='mood'?'Διατύπωση ασθενούς / σημείωση':'Σημείωση'}<textarea aria-label={label+' — καταγραφή'} rows={2} value={mseNote(text,field.key)} onChange={e=>onChange(replaceMseNote(text,field.key,e.target.value))} onBlur={onBlur} placeholder="Προαιρετική περιγραφή…"/></label>
   {previousField?.text.trim()&&(changed||!text.trim())&&<details className="mse-previous-text"><summary>{olderReference?'Παλαιότερη καταγραφή':'Προηγούμενη καταγραφή'}</summary><p style={{whiteSpace:'pre-wrap'}}>{previousField.text}</p></details>}
   {onContinue&&<div className="mse-review-actions">
    {!text.trim()&&onKeep?<button type="button" onClick={onKeep}>Διατήρηση προηγούμενων & συνέχεια</button>:text.trim()?<button type="button" onClick={onContinue}>Συνέχεια →</button>:null}
    {changed&&previousField&&<button type="button" className="mse-skip" onClick={()=>onChange(previousField.text)}>Επαναφορά προηγούμενων</button>}
   </div>}
  </div>
 </details>;
}
