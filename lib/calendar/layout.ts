type TimedEvent = {id:string;scheduled_start:string;scheduled_end:string};
const dayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const minute=(iso:string)=>{const [h,m]=timeFormatter.format(new Date(iso)).split(':').map(Number);return h*60+m};

export function calendarSegment(event:TimedEvent,day:string){
 const startDay=dayFormatter.format(new Date(event.scheduled_start)),endDay=dayFormatter.format(new Date(event.scheduled_end));
 if(startDay>day||endDay<day)return null;
 const start=startDay===day?minute(event.scheduled_start):0;
 const end=endDay===day?minute(event.scheduled_end):1440;
 return end>start?{start,end}:null;
}

export function calendarWindow(events:TimedEvent[],days:string[]){
 const segments=days.flatMap(day=>events.map(event=>calendarSegment(event,day)).filter((part):part is {start:number;end:number}=>Boolean(part)));
 if(!segments.length)return {start:480,end:1200};
 const start=Math.max(0,Math.floor((Math.min(...segments.map(part=>part.start))-60)/60)*60);
 return {start,end:Math.min(1440,Math.max(start+60,Math.ceil((Math.max(...segments.map(part=>part.end))+60)/60)*60))};
}

// Completed/cancelled history may overlap an active appointment; each remains clickable.
export function calendarLanes(events:TimedEvent[],day:string){
 const positions=new Map<string,{lane:number;total:number}>();
 let group:{id:string;lane:number}[]=[],ends:number[]=[],boundary=-1;
 const finish=()=>{for(const entry of group)positions.set(entry.id,{lane:entry.lane,total:ends.length})};
 const parts=events.map(event=>({event,part:calendarSegment(event,day)})).filter((value):value is {event:TimedEvent;part:{start:number;end:number}}=>Boolean(value.part)).sort((a,b)=>a.part.start-b.part.start);
 for(const {event,part} of parts){
  if(part.start>=boundary){finish();group=[];ends=[];boundary=-1;}
  let lane=ends.findIndex(end=>end<=part.start);
  if(lane===-1)lane=ends.length;
  ends[lane]=part.end;boundary=Math.max(boundary,part.end);group.push({id:event.id,lane});
 }
 finish();return positions;
}
