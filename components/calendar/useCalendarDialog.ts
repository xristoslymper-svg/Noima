'use client';
import {useEffect,useRef} from 'react';

export function useCalendarDialog(onClose:()=>void,busy=false,active=true){
 const ref=useRef<HTMLElement>(null);
 const action=useRef({onClose,busy});
 useEffect(()=>{action.current={onClose,busy}},[onClose,busy]);
 useEffect(()=>{
  if(!active)return;
  const node=ref.current;
  if(!node)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const controls=()=>Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(e=>e.getClientRects().length);
  (controls()[0]??node).focus();
  const keyboard=(event:KeyboardEvent)=>{
   if(event.defaultPrevented)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!action.current.busy)action.current.onClose();}
   if(event.key==='Tab'){
    const items=controls(),first=items[0],last=items[items.length-1];
    if(!first){event.preventDefault();node.focus();return;}
    if(event.shiftKey&&(document.activeElement===first||!node.contains(document.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!node.contains(document.activeElement))){event.preventDefault();first.focus();}
   }
  };
  document.addEventListener('keydown',keyboard);
  return()=>{document.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus();};
 },[active]);
 return ref;
}
