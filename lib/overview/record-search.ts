import {outputTranslator,outputLocale} from '../../i18n/output-translator.ts';
import {intlLocale} from '../../i18n/config.ts';
import {selectUpcomingAppointments} from '../calendar/upcoming.ts';
import type {PatientBundle} from '../patients/demo-runtime';

export type SearchPatient={id:string;first_name:string;last_name:string};
export type SearchTopic='medications'|'last_visit'|'next_appointment'|'tasks'|'unsupported';
export type SearchAnswer={answer:string;patient?:SearchPatient;sources:{label:string;href:string}[];choices?:SearchPatient[]};
export const normalizedName=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el-GR').replace(/ς/g,'σ').replace(/[^\p{L}\p{N}\s]/gu,' ').trim();
export function matchPatients(patients:SearchPatient[],name:string){
 const terms=normalizedName(name).split(/\s+/).filter(Boolean);
 if(!terms.length)return [];
 return patients.filter(patient=>{const words=normalizedName(patient.first_name+' '+patient.last_name).split(/\s+/);return terms.every(term=>words.some(word=>word===term||(term.length>=4&&word.length>=4&&(word===term.replace(/σ$/,'')||word.slice(0,-1)===term.slice(0,-1)))||word.startsWith(term)));});
}
const date=(iso:string)=>new Intl.DateTimeFormat(intlLocale(outputLocale()),{timeZone:'Europe/Athens',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
export function recordAnswer(bundle:PatientBundle,topic:SearchTopic,now=Date.now()):SearchAnswer{
 const t=outputTranslator();
 const patient={id:bundle.patient.id,first_name:bundle.patient.first_name,last_name:bundle.patient.last_name},base='/patients/demo/'+patient.id;
 const result=(answer:string,label:string,href:string):SearchAnswer=>({answer,patient,sources:[{label,href}]});
 if(topic==='medications'){
  const active=bundle.medications.filter(m=>m.status==='active');
  const lines=active.map(m=>`${m.medication_name}: ${m.dose} ${m.unit}${m.frequency?' · '+m.frequency:''}\n`+t('clinical.medicationDates',{start:m.started_at,effective:m.effective_from?t('clinical.medicationEffective',{date:m.effective_from}):''}));
  return result(lines.length?t('clinical.recordedMedication',{items:lines.join('\n\n')}):t('clinical.noMedicationNotNegative'),t('clinical.treatmentPlan'),base+'?tab=medications');
 }
 if(topic==='last_visit'){
  const last=bundle.sessions.filter(s=>s.status==='completed').sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at))[0];
  return last?result(t('clinical.latestVisitAnswer',{date:date(last.started_at),kind:last.session_type==='initial_assessment'?t('visits.initialAssessment'):t('visits.followup')}),t('clinical.openSpecificVisit'),base+'?tab=record&session='+last.id):result(t('clinical.noCompletedVisitAnswer'),t('visits.title'),base+'?tab=timeline');
 }
 if(topic==='next_appointment'){
  const next=selectUpcomingAppointments(bundle.appointments,now)[0];
  return next?result(t('clinical.nextAppointmentAnswer',{date:date(next.scheduled_start)}),t('clinical.linkedAppointmentSource'),base+'?appointment='+next.id):result(t('clinical.noNextAppointmentAnswer'),t('clinical.patientRecordSource'),base);
 }
 return {answer:t('clinical.lookupHelp'),sources:[]};
}
