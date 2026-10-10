'use client';
import {useEffect,useRef,useState} from 'react';
import {Mic2} from 'lucide-react';
import SectionDictation from '@/components/dictation/SectionDictation';
import styles from './AssessmentFieldDictation.module.css';

export default function AssessmentFieldDictation({fieldKey,title,onInsert,registerFlusher,onDirtyChange}:{
 fieldKey:string;title:string;onInsert:(text:string)=>void;
 registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);
 onDirtyChange:(key:string,dirty:boolean)=>void;
}){
 const [open,setOpen]=useState(false);
 const pending=useRef(false);
 const key='section:assessment:dictation:'+fieldKey;
 useEffect(()=>registerFlusher(key,async()=>{
  if(pending.current)throw new Error('Ολοκληρώστε ή κλείστε την υπαγόρευση: '+title+'.');
 }),[key,title,registerFlusher]);
 useEffect(()=>()=>onDirtyChange(key,false),[key,onDirtyChange]);
 function close(){pending.current=false;setOpen(false);onDirtyChange(key,false)}
 return <>
  <button type="button" className={styles.microphone} aria-label={'Υπαγόρευση: '+title} title={'Υπαγόρευση: '+title} onClick={()=>{pending.current=true;setOpen(true);onDirtyChange(key,true)}}>
   <Mic2 size={15} aria-hidden="true"/>
  </button>
  {open&&<SectionDictation title={title} onClose={close} onInsert={text=>{onInsert(text);close()}}/>}
 </>;
}
