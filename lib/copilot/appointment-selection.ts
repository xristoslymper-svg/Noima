import {formatClinicDateTime} from '../clinic-time.ts';
type Event={id:string;scheduled_start:string};
export function appointmentWallTime(iso:string){
 const s=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));
 return {local_date:s.slice(0,10),local_time:s.slice(11,16)};
}
// Selection is based on wall-time constraints, not a model-issued ID alone.
export function selectAppointment<T extends Event>(events:T[],p:{event_id:string;target_date:string;target_time:string},query:string,presentation?:{label:(value:string)=>string;date:(iso:string)=>string}):{event?:T;answer:string}{
 const label=presentation?.label||((value:string)=>value),date=presentation?.date||formatClinicDateTime;
 let time=p.target_time||'';
 const q=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/^ακυρωσε(?: μου)? το επομενο(?: ραντεβου)?[.!;]?$/.test(q)&&!p.target_date&&!p.target_time){
  const future=events.filter(e=>Date.parse(e.scheduled_start)>Date.now()).sort((a,b)=>a.scheduled_start.localeCompare(b.scheduled_start));
  if(future.length&&(!future[1]||Date.parse(future[0].scheduled_start)!==Date.parse(future[1].scheduled_start)))return {event:future[0],answer:''};
 }
 const explicit=q.match(/(?:στις|ωρα)\s+(\d{1,2})(?::(\d{2}))?(?:\s*(?:το|τη|την))?\s*(απογευμα|βραδυ|πρωι)?/);
 if(explicit){
  let h=Number(explicit[1]);const minute=explicit[2]||'00';
  if((explicit[3]==='απογευμα'||explicit[3]==='βραδυ')&&h<12)h+=12;
  if(explicit[3]||h>=13||explicit[2])time=String(h).padStart(2,'0')+':'+minute;
  else {
   const possible=events.filter(e=>{const t=appointmentWallTime(e.scheduled_start);return (!p.target_date||t.local_date===p.target_date)&&Number(t.local_time.slice(0,2))%12===h%12&&t.local_time.slice(3)===minute});
   if(possible.length!==1)return {answer:label('Ποια ώρα εννοείς ακριβώς; Πρωί ή απόγευμα;')};
   time=appointmentWallTime(possible[0].scheduled_start).local_time;
  }
 }
 const constrained=Boolean(p.target_date||time);
 const matches=events.filter(e=>{const local=appointmentWallTime(e.scheduled_start);return (!p.target_date||local.local_date===p.target_date)&&(!time||local.local_time===time)});
 if(matches.length===1&&(constrained||events.length===1))return {event:matches[0],answer:''};
 const options=matches.length?matches:events;
 return {answer:label(matches.length?'Ποιο ραντεβού εννοείς;':'Δεν βρέθηκε ραντεβού σε αυτή την ημερομηνία και ώρα. Επίλεξε:')+' '+options.slice(0,8).map(e=>date(e.scheduled_start)).join(' · ')};
}
