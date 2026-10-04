import type {PatientBundle} from '../patients/demo-runtime';
import type {Assessment} from './core-types';
export function visitScoreComparisons(bundle:Pick<PatientBundle,'sessions'|'assessments'|'appointments'>,sessionId:string){
 const session=bundle.sessions.find(s=>s.id===sessionId);if(!session)return [];
 const previous=bundle.sessions.filter(s=>s.id!==sessionId&&s.status==='completed'&&Date.parse(s.completed_at||s.started_at)<=Date.parse(session.started_at)).sort((a,b)=>Date.parse(b.completed_at||b.started_at)-Date.parse(a.completed_at||a.started_at))[0];
 const linked=(a:Assessment,id:string)=>a.session_id===id||(!a.session_id&&Boolean(a.appointment_id)&&bundle.appointments.some(p=>p.id===a.appointment_id&&p.session_id===id));
 const completed=bundle.assessments.filter(a=>a.status==='completed'&&a.score!==null&&a.completed_at);
 const latest=(items:Assessment[])=>items.sort((a,b)=>Date.parse(b.completed_at!)-Date.parse(a.completed_at!))[0]||null;
 return (['PHQ-9','GAD-7'] as const).map(instrument=>{const current=latest(completed.filter(a=>a.instrument===instrument&&linked(a,sessionId)));const prior=previous?latest(completed.filter(a=>a.instrument===instrument&&linked(a,previous.id)&&Date.parse(a.completed_at!)<=Date.parse(session.started_at))):null;const comparable=Boolean(current&&prior&&current.instrument_version===prior.instrument_version);return {instrument,current,prior,previous,comparable,delta:comparable?current!.score!-prior!.score!:null}});
}
