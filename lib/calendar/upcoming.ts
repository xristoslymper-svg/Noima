export type UpcomingContext={excludeAppointmentId?:string|null;excludeSessionId?:string|null};
type Appointment={id:string;session_id?:string|null;status:string;scheduled_start:string};
/** A next appointment starts now or later and is never the active visit. */
export function selectUpcomingAppointments<T extends Appointment>(appointments:T[],now:number,context:UpcomingContext={}):T[]{
 if(!Number.isFinite(now))return [];
 return appointments.filter(a=>a.status==='scheduled'&&a.id!==context.excludeAppointmentId&&(!context.excludeSessionId||a.session_id!==context.excludeSessionId)&&Date.parse(a.scheduled_start)>=now)
  .sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start)||a.id.localeCompare(b.id));
}
