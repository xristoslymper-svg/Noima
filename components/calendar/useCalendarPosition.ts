'use client';
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {readCalendarPosition,type CalendarPosition} from '@/lib/calendar/appointment-context';
import {consumeCalendarResume,rememberCalendarDeparture} from '@/lib/calendar/return-context';
import {getDemoTesterId} from '@/lib/demo-tester';
export function useCalendarPosition({date,view,filter,setDate,setView,setFilter,scroller,loading}:{date:string;view:'day'|'week';filter:string;setDate:(date:string)=>void;setView:(view:'day'|'week')=>void;setFilter:(filter:string)=>void;scroller:RefObject<HTMLElement|null>;loading:boolean}){
 const [ready,setReady]=useState(false);const restoring=useRef(false),saved=useRef<CalendarPosition|null>(null),explicitDeparture=useRef(false);
 useEffect(()=>{const workspace=getDemoTesterId(),url=new URL(location.href);let position=readCalendarPosition(history.state?.noimaCalendar,workspace);
  if(url.searchParams.get('resumeVisit')==='1'){position=consumeCalendarResume(workspace)||position;url.searchParams.delete('resumeVisit');history.replaceState({...history.state,...(position?{noimaCalendar:position}:{})},'',url.pathname+url.search+url.hash)}
  if(position){saved.current=position;restoring.current=true;setDate(position.date);setView(position.view);setFilter(position.filter)}
  if(!position&&matchMedia('(max-width: 760px)').matches)setView('day');setReady(true);
 },[setDate,setView,setFilter]);
 const remember=useCallback(()=>{if(!ready||restoring.current||location.pathname!=='/calendar')return;const workspace=getDemoTesterId();if(!workspace)return;const element=scroller.current;const position:CalendarPosition={workspace,date,view,filter,top:element?.scrollTop??0,left:element?.scrollLeft??0,pageTop:scrollY};history.replaceState({...history.state,noimaCalendar:position},'');},[ready,date,view,filter,scroller]);
 useEffect(()=>{if(!ready||loading||!restoring.current||!saved.current)return;const position=saved.current;const frame=requestAnimationFrame(()=>{scroller.current?.scrollTo({top:position.top,left:position.left,behavior:'instant'});scrollTo({top:position.pageTop,behavior:'instant'});restoring.current=false});return()=>cancelAnimationFrame(frame)},[ready,loading,view,scroller]);
 useEffect(()=>{remember();window.addEventListener('scroll',remember,{passive:true});return()=>window.removeEventListener('scroll',remember)},[remember]);
 useEffect(()=>{
  const leave=()=>{remember();const p=readCalendarPosition(history.state?.noimaCalendar,getDemoTesterId());if(p)rememberCalendarDeparture(p,explicitDeparture.current)};
  const click=(e:MouseEvent)=>{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const a=(e.target as Element).closest('a');if(!a||a.target==='_blank')return;const url=new URL(a.href);if(url.origin===location.origin&&url.pathname.startsWith('/patients/demo/')){explicitDeparture.current=true;leave()}};
  document.addEventListener('click',click,true);window.addEventListener('pagehide',leave);return()=>{document.removeEventListener('click',click,true);window.removeEventListener('pagehide',leave)};
 },[remember]);
 const depart=useCallback(()=>{explicitDeparture.current=true;remember();const position=readCalendarPosition(history.state?.noimaCalendar,getDemoTesterId());if(position)rememberCalendarDeparture(position,true)},[remember]);
 return {ready,restoring,remember,depart};
}
