'use client';
import {useEffect,useId,useRef} from 'react';
import {useTranslations} from 'next-intl';
import {Plus} from 'lucide-react';
import styles from './HistoryAddMenu.module.css';

export type HistoryAddAction='score'|'scan'|'document';
export default function HistoryAddMenu({onSelect}:{onSelect:(action:HistoryAddAction)=>void}){
 const t=useTranslations(),id=useId(),menu=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{if(menu.current?.open&&event.target instanceof Node&&!menu.current.contains(event.target))menu.current.open=false};
  document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
 },[]);
 function choose(action:HistoryAddAction){if(menu.current)menu.current.open=false;onSelect(action)}
 return <details className={styles.menu} ref={menu} onKeyDown={event=>{if(event.key==='Escape'&&menu.current?.open){event.preventDefault();event.stopPropagation();menu.current.open=false;menu.current.querySelector('summary')?.focus()}}}>
  <summary aria-controls={id}><Plus size={15}/>{t('historical.add')}</summary>
  <div className={styles.options} id={id}>
   <button type="button" onClick={()=>choose('score')}>{t('historical.score')}</button>
   <button type="button" onClick={()=>choose('scan')}>{t('patientDocuments.scan')}</button>
   <button type="button" onClick={()=>choose('document')}>{t('patientDocuments.document')}</button>
  </div>
 </details>;
}
