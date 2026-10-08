'use client';
import {useEffect,useRef} from 'react';

const layers:symbol[]=[];
let previousOverflow='';

// Each nested overlay owns one lock; closing a child must not unlock its parent.
export function useOverlayDismiss(onClose:()=>void,{active=true,busy=false}:{active?:boolean;busy?:boolean}={}){
 const action=useRef({onClose,busy});action.current={onClose,busy};
 useEffect(()=>{
  if(!active)return;
  const id=Symbol('overlay');
  if(!layers.length){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}
  layers.push(id);
  const keyboard=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||event.defaultPrevented||layers[layers.length-1]!==id)return;
   event.preventDefault();event.stopImmediatePropagation();
   if(!action.current.busy)action.current.onClose();
  };
  document.addEventListener('keydown',keyboard);
  return()=>{document.removeEventListener('keydown',keyboard);const index=layers.indexOf(id);if(index>=0)layers.splice(index,1);if(!layers.length)document.body.style.overflow=previousOverflow};
 },[active]);
}
