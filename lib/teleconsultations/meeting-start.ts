import {isClinicalId} from '../clinical/identity.ts';
export type MeetingVisit={id:string;patient_id:string;status:string;session_type:string};
type StartInput={patientId:string;visits:MeetingVisit[];sessionId?:string;appointmentId?:string};
export async function startMeetingVisit(input:StartInput,post:(body:Record<string,unknown>)=>Promise<Record<string,unknown>>):Promise<string>{
 if(!isClinicalId(input.patientId))throw new Error('Επιλέξτε έγκυρο ασθενή.');
 if(input.sessionId){
  const visit=input.visits.find(v=>v.id===input.sessionId&&v.patient_id===input.patientId&&v.status==='draft'&&v.session_type==='follow_up');
  if(!visit)throw new Error('Η επιλεγμένη επίσκεψη δεν είναι διαθέσιμη.');
  return visit.id;
 }
 const drafts=input.visits.filter(v=>v.patient_id===input.patientId&&v.status==='draft');
 if(!input.appointmentId&&drafts.length>1)throw new Error('Επιλέξτε ποια ανοιχτή επίσκεψη θα συνεχίσετε.');
 if(!input.appointmentId&&drafts.length===1){
  if(drafts[0].session_type!=='follow_up')throw new Error('Ολοκληρώστε πρώτα την αρχική αξιολόγηση στον φάκελο.');
  return drafts[0].id;
 }
 if(input.appointmentId&&!isClinicalId(input.appointmentId))throw new Error('Μη έγκυρο ραντεβού.');
 const result=await post(input.appointmentId?{action:'start_session',appointment_id:input.appointmentId}:{action:'start_session',patient_id:input.patientId,session_type:'follow_up'});
 const session=result.session as MeetingVisit|undefined;
 if(!session||!isClinicalId(session.id)||session.patient_id!==input.patientId||session.status!=='draft'||session.session_type!=='follow_up')throw new Error('Δεν επιβεβαιώθηκε η επίσκεψη του επιλεγμένου ασθενή.');
 return session.id;
}
export function athensDay(value:number|string){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type)?.value).join('-');
}
export function currentMeetings<T extends {completed:boolean;active?:boolean;record:{sessionId:string;appointment:{scheduled_start:string;status:string}}}>(entries:T[],now=Date.now()){
 const day=athensDay(now),seen=new Set<string>();
 return entries.filter(e=>!e.completed&&e.record.appointment.status==='scheduled'&&(e.active||athensDay(e.record.appointment.scheduled_start)===day))
 .filter(e=>{if(seen.has(e.record.sessionId))return false;seen.add(e.record.sessionId);return true})
 .sort((a,b)=>Date.parse(a.record.appointment.scheduled_start)-Date.parse(b.record.appointment.scheduled_start));
}
