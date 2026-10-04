export const CLINIC_TIMEZONE='Europe/Athens';

// Resolve wall time against the actual zone, refusing nonexistent or ambiguous DST times.
export function clinicLocalToIso(date:string,time:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))throw new Error('Ελέγξτε ημερομηνία και ώρα.');
 const [y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number);
 const guess=Date.UTC(y,m-1,d,h,min);
 if(h>23||min>59||new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)!==date)throw new Error('Μη έγκυρη ημερομηνία ή ώρα.');
 const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:CLINIC_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const matches=[];
 for(const offset of [120,180]){
  const value=new Date(guess-offset*60000);
  if(formatter.format(value)===date+' '+time)matches.push(value.toISOString());
 }
 if(matches.length!==1)throw new Error(matches.length?'Η ώρα εμφανίζεται δύο φορές λόγω αλλαγής ώρας. Επιλέξτε ώρα εκτός του διπλού διαστήματος.':'Η ώρα δεν υπάρχει λόγω αλλαγής ώρας. Επιλέξτε άλλη ώρα.');
 return matches[0];
}

const asDate=(value:string|Date)=>value instanceof Date?value:new Date(value);

export function formatClinicDate(value:string|Date){
  return new Intl.DateTimeFormat('el-GR',{timeZone:CLINIC_TIMEZONE,day:'2-digit',month:'short',year:'numeric'}).format(asDate(value));
}

export function formatClinicDateTime(value:string|Date){
  return new Intl.DateTimeFormat('el-GR',{timeZone:CLINIC_TIMEZONE,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(asDate(value));
}

export function formatClinicAppointment(value:string|Date){
  return new Intl.DateTimeFormat('el-GR',{timeZone:CLINIC_TIMEZONE,weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(asDate(value));
}
