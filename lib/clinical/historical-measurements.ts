import type {Assessment} from './core-types';

export type HistoricalMeasurement = {
 id:string;tester_id:string;patient_id:string;instrument:'PHQ-9'|'GAD-7';instrument_version:string;
 score:number;administered_on:string;source:'historical_manual'|'historical_scan';answers:number[]|null;
 note:string;document_ids:string[];actor_id:string;created_at:string;confirmed_at:string;
 supersedes_id:string|null;correction_reason:string;
};
export function clinicalToday(now=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function validAdministrationDate(value:unknown,today=clinicalToday()):value is string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>today)return false;
 const date=new Date(value+'T12:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function validHistoricalScore(instrument:unknown,score:unknown):score is number{
 return (instrument==='PHQ-9'||instrument==='GAD-7')&&typeof score==='number'&&Number.isInteger(score)&&score>=0&&score<=(instrument==='PHQ-9'?27:21);
}
/** Read-only adapter for existing measurement charts. No questionnaire is created. */
export function historicalMeasurementProjection(row:HistoricalMeasurement):Assessment{
 const answers=row.source==='historical_scan'&&row.answers?.length===(row.instrument==='PHQ-9'?9:7)&&row.answers.every(answer=>Number.isInteger(answer)&&answer>=0&&answer<=3)&&row.answers.reduce((total,answer)=>total+answer,0)===row.score?row.answers:null;
 return {
  id:row.id,patient_id:row.patient_id,tester_id:row.tester_id,instrument:row.instrument,instrument_version:row.instrument_version,
  status:'completed',appointment_id:null,session_id:null,expires_at:'',opened_at:null,
  completed_at:row.administered_on,created_at:row.created_at,answers,score:row.score,
  // A scanned positive answer is historical and has been explicitly reviewed.
  // A manual total says nothing about any individual answer, including item 9.
  item9_review:row.instrument==='PHQ-9'&&Boolean(answers&&answers[8]>0),
  item9_reviewed_at:answers?row.confirmed_at:null,reviewed_at:row.confirmed_at,
  provenance:row.source,measurement_source:row.source,administered_on:row.administered_on,
  entered_by:row.actor_id,document_ids:row.document_ids,note:row.note,supersedes_id:row.supersedes_id,
 };
}
export function historicalMeasurementsUnavailable(error:unknown){
 const message=error instanceof Error?error.message:String(error);
 return /Could not find the function.*demo_historical_measurement|PGRST202|function public\.demo_historical_measurement.*does not exist/i.test(message);
}
