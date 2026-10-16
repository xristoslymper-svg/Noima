import {readCalendarPosition,type CalendarPosition} from './appointment-context.ts';
const departureKey='noima-calendar-departure',resumeKey='noima-calendar-resume';
export function validCalendarDeparture(value:unknown,workspace:string,fromCalendar:boolean,now=Date.now()):CalendarPosition|null{
 if(!value||typeof value!=='object')return null;const v=value as {at?:number;explicit?:boolean;position?:unknown};
 if(typeof v.at!=='number'||v.at>now||now-v.at>60000||(!v.explicit&&!fromCalendar))return null;
 return readCalendarPosition(v.position,workspace);
}
export function rememberCalendarDeparture(position:CalendarPosition,explicit=false){try{sessionStorage.setItem(departureKey,JSON.stringify({at:Date.now(),position,explicit}))}catch{}}
export function captureCalendarReturn(workspace:string){
 if(readCalendarPosition(history.state?.noimaVisitCalendar,workspace))return;
 try{const raw=sessionStorage.getItem(departureKey);sessionStorage.removeItem(departureKey);if(!raw)return;let fromCalendar=false;try{const ref=new URL(document.referrer);fromCalendar=ref.origin===location.origin&&ref.pathname==='/calendar'}catch{}
  const position=validCalendarDeparture(JSON.parse(raw),workspace,fromCalendar);if(position)history.replaceState({...history.state,noimaVisitCalendar:position},'');
 }catch{/* A direct entry safely falls back to today's calendar. */}
}
export function calendarReturnUrl(workspace:string){
 const position=readCalendarPosition(history.state?.noimaVisitCalendar,workspace);if(!position)return '/calendar';
 try{sessionStorage.setItem(resumeKey,JSON.stringify(position));return '/calendar?resumeVisit=1'}catch{return '/calendar'}
}
export function consumeCalendarResume(workspace:string):CalendarPosition|null{
 try{const raw=sessionStorage.getItem(resumeKey);sessionStorage.removeItem(resumeKey);return raw?readCalendarPosition(JSON.parse(raw),workspace):null}catch{return null}
}
