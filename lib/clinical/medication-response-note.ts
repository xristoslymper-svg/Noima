/**
 * Clinician-explicit medication response as text in the existing visit closure.
 * This deliberately does not infer adherence, change the medication order,
 * or introduce a new data field. Only this exact generated line can be changed.
 */
export type MedicationResponse = 'good'|'neutral';
export type ResponseMedication = {medication_name:string;dose:string|number;unit:string;frequency:string};

const display=(value:unknown)=>String(value??'').replace(/\s+/g,' ').trim();
export function medicationResponsePrefix(medication:ResponseMedication){
 return 'Ανταπόκριση στην αγωγή · '+display(medication.medication_name)+' ('+display(medication.dose)+' '+display(medication.unit)+' · '+display(medication.frequency)+'): ';
}
const textFor=(response:MedicationResponse)=>response==='good'?'Καλή.':'Ουδέτερη.';
export function readMedicationResponse(summary:string,medication:ResponseMedication):MedicationResponse|null{
 const prefix=medicationResponsePrefix(medication);
 const lines=summary.split(/\r?\n/);
 if(lines.includes(prefix+textFor('good')))return 'good';
 if(lines.includes(prefix+textFor('neutral')))return 'neutral';
 return null;
}
export function updateMedicationResponse(summary:string,medication:ResponseMedication,response:MedicationResponse|null){
 const newline=summary.includes('\r\n')?'\r\n':'\n';
 const prefix=medicationResponsePrefix(medication);
 const known=[prefix+textFor('good'),prefix+textFor('neutral')];
 // Retain every original free-text line; change only the exact generated annotation.
 const lines=summary.split(newline);
 const indexes=lines.map((line,i)=>known.includes(line)?i:-1).filter(i=>i>=0);
 if(indexes.length===0){
  if(!response)return summary;
  return summary+(summary&&!summary.endsWith(newline)?newline:'')+prefix+textFor(response);
 }
 const next=lines.filter((line,i)=>!indexes.includes(i));
 if(response)next.splice(indexes[0],0,prefix+textFor(response));
 return next.join(newline);
}
