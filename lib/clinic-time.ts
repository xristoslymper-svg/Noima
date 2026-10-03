export const CLINIC_TIMEZONE='Europe/Athens';

const asDate=(value:string|Date)=>value instanceof Date?value:new Date(value);

export function formatClinicDate(value:string|Date){
  return new Intl.DateTimeFormat('el-GR',{timeZone:CLINIC_TIMEZONE,day:'2-digit',month:'short',year:'numeric'}).format(asDate(value));
}

export function formatClinicDateTime(value:string|Date){
  return new Intl.DateTimeFormat('el-GR',{timeZone:CLINIC_TIMEZONE,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(asDate(value));
}

export function formatClinicAppointment(value:string|Date){
  return new Intl.DateTimeFormat('el-GR',{timeZone:CLINIC_TIMEZONE,weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(asDate(value));
}
