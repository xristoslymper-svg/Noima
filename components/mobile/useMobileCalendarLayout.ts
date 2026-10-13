'use client';
import {useEffect,useState} from 'react';
import {mobileV2Enabled} from './mobile-v2';

export function useMobileCalendarLayout(){
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{
  if(!mobileV2Enabled)return;
  const query=window.matchMedia('(max-width:760px)');
  const update=()=>setMobile(query.matches);
  update();query.addEventListener('change',update);
  return()=>query.removeEventListener('change',update);
 },[]);
 return mobile;
}
