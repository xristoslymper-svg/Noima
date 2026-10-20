'use client';
import {useLocale,useTranslations} from 'next-intl';
import {useEffect,useId,useRef,useState,type DragEvent,type ReactNode} from 'react';
import Link from 'next/link';
import {ArrowRight,ArrowLeft,CalendarPlus,Columns3,GripVertical,Pencil,RotateCcw,X} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import {defaultRegistryLayout,moveRegistryColumn,normalizeRegistryLayout,registryColumns,registryLayoutKey,showRegistryColumn,type PatientRegistryRow,type RegistryColumnId,type RegistryLayout} from '@/lib/patients/registry-layout';
import {intlLocale} from '@/i18n/config';
import styles from './PatientRegistryTable.module.css';
const dated=(value:string|null|undefined,withTime:boolean,locale:string,t:ReturnType<typeof useTranslations>):ReactNode=>{const day=new Intl.DateTimeFormat(intlLocale(locale),{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Athens'});const clock=new Intl.DateTimeFormat(intlLocale(locale),{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Athens'});if(!value||!Number.isFinite(Date.parse(value)))return '—';const date=new Date(value);return <time dateTime={value} title={day.format(date)+' · '+clock.format(date)}>{day.format(date)}{withTime&&<small>{clock.format(date)} · {t('registry.athens')}</small>}</time>};
function cell(row:PatientRegistryRow,id:RegistryColumnId,locale:string,t:ReturnType<typeof useTranslations>){
 switch(id){
  case 'registry':return String(row.registry_number).padStart(3,'0');
  case 'age':return row.reported_age==null?'—':t('registry.age',{age:row.reported_age});
  case 'phone':return row.phone||'—';
  case 'email':return row.email||'—';
  case 'landline':return row.landline||'—';
  case 'contact':return row.contact_phone||'—';
  case 'address':return row.address||'—';
  case 'diagnosis':return row.diagnosis?<strong title={row.diagnosis.label}>{row.diagnosis.code}</strong>:'—';
  case 'diagnosisLabel':return row.diagnosis?.label||'—';
  case 'last':return dated(row.last_session?.completed_at,false,locale,t);
  case 'next':return dated(row.next_appointment?.scheduled_start,true,locale,t);
  case 'created':return dated(row.created_at,false,locale,t);
  case 'updated':return dated(row.updated_at,false,locale,t);
  case 'status':return row.status==='active'?t('registry.active'):row.status==='inactive'?t('registry.inactive'):row.status==='archived'?t('registry.archived'):row.status||'—';
  case 'draft':return row.draft?<span className={styles.badge}>{t('current.m188')}</span>:'—';
  case 'complaint':return row.chief_complaint||'—';
  case 'note':return row.note||'—';
  default:return null;
 }
}
export default function PatientRegistryTable({rows,total,assign,onReset}:{rows:PatientRegistryRow[];total:number;assign:string|null;onReset:()=>void}){
 const t=useTranslations(),locale=useLocale();

 const [layout,setLayout]=useState<RegistryLayout>(defaultRegistryLayout),[ready,setReady]=useState(false),[customizing,setCustomizing]=useState(false),[storageError,setStorageError]=useState(''),[announcement,setAnnouncement]=useState(''),[over,setOver]=useState<RegistryColumnId|null>(null);
 const dragging=useRef<RegistryColumnId|null>(null),key=useRef<string|null>(null),panelId=useId();
 useEffect(()=>{try{key.current=registryLayoutKey(getDemoTesterId());const saved=key.current?localStorage.getItem(key.current):null;setLayout(normalizeRegistryLayout(saved?JSON.parse(saved):null))}catch{setStorageError('registry.loadedError')}setReady(true)},[]);
 function update(next:RegistryLayout){const normalized=normalizeRegistryLayout(next);setLayout(normalized);try{if(!key.current)throw new Error('missing_owner');localStorage.setItem(key.current,JSON.stringify(normalized));setStorageError('')}catch{setStorageError('registry.saveError')}}
 function move(source:RegistryColumnId,target:RegistryColumnId){if(source===target)return;update(moveRegistryColumn(layout,source,target));setAnnouncement(t('registry.moved',{column:t(('registry.columns.'+source) as `registry.columns.${RegistryColumnId}`)}))}
 function begin(event:DragEvent,source:RegistryColumnId){dragging.current=source;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',source)}
 function dragOver(event:DragEvent,target:RegistryColumnId){if(dragging.current){event.preventDefault();event.dataTransfer.dropEffect='move';setOver(target)}}
 function drop(event:DragEvent,target:RegistryColumnId){event.preventDefault();if(dragging.current)move(dragging.current,target);dragging.current=null;setOver(null)}
 const ordered=layout.order.map(id=>registryColumns.find(c=>c.id===id)!);
 const visible=ordered.filter(c=>!layout.hidden.includes(c.id));
 return <section className={styles.registry}>
  <div className={styles.toolbar}><button type="button" className={styles.columnsButton} disabled={!ready} aria-expanded={customizing} aria-controls={panelId} onClick={()=>setCustomizing(v=>!v)}><Columns3 size={16} aria-hidden="true"/>{t('current.m189')}</button></div>
  {customizing&&<section id={panelId} className={styles.preferences} aria-label={t('current.m196')}>
   <header><div><h2>{t('current.m190')}</h2><p>{t('current.m191')}</p></div><button type="button" onClick={()=>setCustomizing(false)} aria-label={t('current.m197')}><X size={17}/></button></header>
   <ul className={styles.columnList}>{ordered.map((column,index)=><li key={column.id} data-preference-column={column.id} className={over===column.id?styles.dropTarget:undefined} onDragOver={event=>dragOver(event,column.id)} onDrop={event=>drop(event,column.id)}>
    <span className={styles.grip} draggable onDragStart={event=>begin(event,column.id)} onDragEnd={()=>{dragging.current=null;setOver(null)}} aria-label={t('registry.drag',{column:t(('registry.columns.'+column.id) as `registry.columns.${RegistryColumnId}`)})}><GripVertical size={16} aria-hidden="true"/></span>
    <label><input type="checkbox" checked={!layout.hidden.includes(column.id)} disabled={column.id==='name'} aria-label={t('registry.show',{column:t(('registry.columns.'+column.id) as `registry.columns.${RegistryColumnId}`)})} onChange={event=>update(showRegistryColumn(layout,column.id,event.target.checked))}/><span>{t(('registry.columns.'+column.id) as `registry.columns.${RegistryColumnId}`)}{column.id==='name'&&<small>{t('current.m192')}</small>}</span></label>
    <button type="button" disabled={index===0} aria-label={t('registry.left',{column:t(('registry.columns.'+column.id) as `registry.columns.${RegistryColumnId}`)})} onClick={()=>move(column.id,ordered[index-1].id)}><ArrowLeft size={15} aria-hidden="true"/></button>
    <button type="button" disabled={index===ordered.length-1} aria-label={t('registry.right',{column:t(('registry.columns.'+column.id) as `registry.columns.${RegistryColumnId}`)})} onClick={()=>move(column.id,ordered[index+1].id)}><ArrowRight size={15} aria-hidden="true"/></button>
   </li>)}</ul>
   <footer><p>{t('current.m193')}</p><button type="button" onClick={()=>{update(defaultRegistryLayout());setAnnouncement(t('registry.reset'))}}><RotateCcw size={15} aria-hidden="true"/>{t('current.m194')}</button></footer>
  </section>}
  {storageError&&<p className={styles.warning} role="status">{t(storageError as 'registry.loadedError'|'registry.saveError')}</p>}
  <p className={styles.srOnly} aria-live="polite">{announcement}</p>
  <div className={styles.scroll} role="region" aria-label={t('current.m198')} tabIndex={0}>
   <table className={styles.table} style={{minWidth:visible.reduce((width,column)=>width+column.width,128)}}>
    <caption className={styles.srOnly}>{t('registry.caption',{shown:rows.length,total})}</caption>
    <colgroup>{visible.map(column=><col key={column.id} style={{width:column.width}}/>)}<col style={{width:128}}/></colgroup>
    <thead><tr>{visible.map(column=><th key={column.id} scope="col" aria-label={t(('registry.columns.'+column.id) as `registry.columns.${RegistryColumnId}`)} data-column-id={column.id} className={over===column.id?styles.dropTarget:undefined} onDragOver={event=>dragOver(event,column.id)} onDrop={event=>drop(event,column.id)}><span className={styles.headerLabel}><button type="button" draggable className={styles.headerGrip} aria-label={t('registry.configure',{column:t(('registry.columns.'+column.id) as `registry.columns.${RegistryColumnId}`)})} title={t('current.m199')} onClick={()=>setCustomizing(true)} onDragStart={event=>begin(event,column.id)} onDragEnd={()=>{dragging.current=null;setOver(null)}}><GripVertical size={14} aria-hidden="true"/></button><span>{t(('registry.columns.'+column.id) as `registry.columns.${RegistryColumnId}`)}</span></span></th>)}<th scope="col" className={styles.actions}>{t('common.actions')}</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.id} data-patient-id={row.id}>{visible.map(column=><td key={column.id} data-column-id={column.id} className={column.id==='name'?styles.name:column.id==='registry'?styles.number:undefined}>{column.id==='name'?<Link href={`/patients/demo/${row.id}${assign?'?tab=psychometrics&instrument='+encodeURIComponent(assign):''}`} className="registry-patient-link"><strong>{row.first_name} {row.last_name}</strong></Link>:cell(row,column.id,locale,t)}</td>)}<td className={styles.actions}><div className={styles.rowActions}><Link className={styles.appointment} aria-label={t('registry.appointment',{name:row.first_name+' '+row.last_name})} href={`/calendar?patient=${encodeURIComponent(row.id)}`} title={t('calendar.newAppointment')}><CalendarPlus size={16} aria-hidden="true"/><span>{t('current.m195')}</span></Link><Link className={styles.edit} aria-label={t('registry.edit',{name:row.first_name+' '+row.last_name})} title={t('patients.editDetails')} href={`/patients/demo/${row.id}?tab=history`}><Pencil size={16} aria-hidden="true"/></Link></div></td></tr>)}</tbody>
   </table>
   {!rows.length&&<div className="registry-state" role="status">{total?<><p>{t('patients.noFilterMatches')}</p><button type="button" className="registry-reset" onClick={onReset}>{t('patients.clearFilters')}</button></>:<><p>{t('patients.emptyWorkspace')}</p><p>{t('patients.createFirstHelp')}</p></>}</div>}
  </div>
 </section>;
}
