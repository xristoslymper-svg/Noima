import type {DemoMedication,PatientBundle} from '../patients/demo-runtime';

// A dose correction replaces a same-day event, preserving its original audit entry.
export function medicationEditRequest(bundle:PatientBundle,medication:DemoMedication,today:string,sessionId:string|undefined,dose:number,unit:string,frequency:string){
 const effectiveOn=medication.status==='planned'?medication.started_at.slice(0,10):today;
 const sameDay=bundle.medicationEvents.find(e=>e.medication_id===medication.id&&e.effective_on===effectiveOn&&!bundle.medicationRevisions.some(r=>r.event_id===e.id));
 return {action:'medication_event',replace_id:sameDay?.id||null,event_type:sameDay?.event_type||'changed',expected_version:medication.plan_version,medication_id:medication.id,session_id:sessionId||null,dose,unit:unit.trim(),frequency:frequency.trim(),effective_on:effectiveOn,reason:sameDay?'Διόρθωση από τον πίνακα αγωγής':''};
}

export function medicationStopRequest(medication:DemoMedication,effectiveOn:string,sessionId?:string){
 if(!effectiveOn||effectiveOn<medication.started_at.slice(0,10))throw new Error('Η διακοπή δεν μπορεί να προηγείται της έναρξης.');
 return {action:'medication_event',event_type:'stopped',expected_version:medication.plan_version,medication_id:medication.id,session_id:sessionId||null,effective_on:effectiveOn,reason:''};
}
