'use client';
import {medicationTimes,selectedMedicationTimes,toggleMedicationTime} from '@/lib/clinical/medication-frequency';

export default function MedicationFrequency({value,onChange,disabled,label='Συχνότητα'}:{value:string;onChange:(value:string)=>void;disabled?:boolean;label?:string}){
 const selected=selectedMedicationTimes(value);
 return <div className="med-frequency">
  <div role="group" aria-label={'Ώρες λήψης · '+label} className="med-frequency-times">
   {medicationTimes.map(time=><button key={time} type="button" aria-pressed={selected?.includes(time)||false} disabled={disabled||selected===null} onClick={()=>onChange(toggleMedicationTime(value,time))}>{time}</button>)}
  </div>
  <input className="med-inline-input" aria-label={label} value={value} disabled={disabled} placeholder="Ώρες ή ειδικές οδηγίες…" onChange={event=>onChange(event.target.value)}/>
  {selected===null&&<button className="med-frequency-reset" type="button" disabled={disabled} onClick={()=>onChange('')}>Αντικατάσταση με ώρες λήψης</button>}
 </div>;
}
