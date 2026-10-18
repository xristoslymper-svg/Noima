export const PREVIEW_BRANCH='codex/daily-teleconsultations';
export const FREE_BUDGET=9000; // Participant minutes; 1000-minute margin below provider allowance.
export type Appointment={id:string;patient_id:string;session_id:string;status:'scheduled'|'cancelled'|'completed';scheduled_start:string;scheduled_end:string};
export function previewEnabled(env:Record<string,string|undefined>){return env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF===PREVIEW_BRANCH}
export function appointmentContext(appointment:Appointment,patientId:string,sessionId:string){
 if(!appointment.id||appointment.patient_id!==patientId||appointment.session_id!==sessionId)throw new Error('Η επίσκεψη δεν ανήκει στο ραντεβού.');
 if(appointment.status!=='scheduled')throw new Error('Το ραντεβού δεν είναι διαθέσιμο για κλήση.');
 const start=Date.parse(appointment.scheduled_start),end=Date.parse(appointment.scheduled_end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('Μη έγκυρη ώρα ραντεβού.');
 return {appointmentId:appointment.id,patientId,sessionId};
}
export function roomPolicy(now:number,minutes:number){
 if(!Number.isInteger(now)||now<0||!Number.isInteger(minutes)||minutes<1||minutes>60)throw new Error('Μη έγκυρη διάρκεια.');
 return {privacy:'private' as const,properties:{nbf:now,exp:now+minutes*60,max_participants:2,eject_at_room_exp:true,enable_recording:false,enable_transcription:false,enable_knocking:true}};
}
export function reservationCost(minutes:number){roomPolicy(0,minutes);return (minutes+1)*2} // Conservative rounding margin.
export function withinFreeBudget(committed:number,reserved:number,minutes:number){
 if(!Number.isSafeInteger(committed)||committed<0||!Number.isSafeInteger(reserved)||reserved<0)return false;
 return committed+reserved+reservationCost(minutes)<=FREE_BUDGET;
}
export type Reservation={id:string;expires:number};
export interface BudgetLedger{
 // Must be one durable transaction across ALL users, rooms and concurrent requests.
 reserve(input:{key:string;month:string;cost:number;cap:number;expires:number}):Promise<Reservation|null>;
}
export async function reserveCall(ledger:BudgetLedger,input:{key:string;month:string;minutes:number;now:number}){
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(input.key)||!/^\d{4}-\d{2}$/.test(input.month))throw new Error('Μη έγκυρη κράτηση.');
 const policy=roomPolicy(input.now,input.minutes);
 const reservation=await ledger.reserve({key:input.key,month:input.month,cost:reservationCost(input.minutes),cap:FREE_BUDGET,expires:policy.properties.exp});
 if(!reservation)throw new Error('Το δωρεάν όριο δεν επαρκεί. Δεν δημιουργήθηκε κλήση.');
 return {reservation,policy};
}
