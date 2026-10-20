'use client';
import {useLocale} from 'next-intl';
import {useTranslations} from 'next-intl';
import {useSystemMessage} from '@/i18n/system-message';
import {useRef,useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {continuityContexts} from '@/lib/clinical/continuity-context';
import {groupContextSources} from '@/lib/clinical/context-presentation';
import {demoPost} from '@/lib/patients/demo-client';
import {formatClinicDateTime} from '@/lib/clinic-time';
import styles from './PatientRecord.module.css';
export default function PatientContext({bundle,reload,onVisit}:{bundle:PatientBundle;reload:()=>Promise<unknown>;onVisit:(id:string)=>void}){
 const t=useTranslations();
 const systemMessage=useSystemMessage();
 const locale=useLocale();

 const items=continuityContexts(bundle),active=items.filter(i=>i.status==='active');
 const groups=groupContextSources(active);
 const [editing,setEditing]=useState<{id:string;revision:number;content:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef<{id:string;action:string;content:string;requestId:string}|null>(null),flight=useRef(false);
 async function revise(item:typeof items[number],action:'updated'|'resolved',content:string){
  if(flight.current)return;flight.current=true;setBusy(true);setError('');
  const intent={id:item.id,action,content};
  if(!request.current||request.current.id!==intent.id||request.current.action!==action||request.current.content!==content)request.current={...intent,requestId:crypto.randomUUID()};
  let committed=false;
  try{await demoPost({action:'revise_context',source_session_id:item.id,request_id:request.current.requestId,context_action:action,content,expected_revision:editing?.id===item.id?editing.revision:item.revision});committed=true;setEditing(null);request.current=null;const fresh=await reload();if(!fresh)setError(t('clinical.contextSavedRefreshView'));}
  catch(e){setError(committed?t('clinical.contextSavedRefresh'):e instanceof Error?e.message:t('errors.contextSave'))}
  finally{flight.current=false;setBusy(false)}
 }
 if(!items.length)return null;
 const row=(item:typeof items[number])=><article key={item.id}><p>{item.content}</p><small>{t('clinical.confirmedSourcePrefix')} {formatClinicDateTime(item.sourceDate, locale)}{item.revision>0&&<>  {t('clinical.updatedSuffix')} {formatClinicDateTime(item.updatedAt)}</>} <button type="button" className={styles.link} onClick={()=>onVisit(item.sourceSessionId)}>{t('visits.visit')}</button></small>{editing?.id===item.id?<div><label>{t('clinical.updateKeyContext')}<textarea maxLength={2000} rows={2} value={editing.content} onChange={e=>setEditing({...editing,content:e.target.value})}/></label><button type="button" disabled={busy||!editing.content.trim()} onClick={()=>void revise(item,'updated',editing.content.trim())}>{t('clinical.saveUpdate')}</button><button type="button" disabled={busy} onClick={()=>{setEditing(null);setError('')}}>{t('common.cancel')}</button></div>:<div><button type="button" className={styles.link} disabled={busy} onClick={()=>{setEditing({id:item.id,revision:item.revision,content:item.content});setError('')}}>{t('common.update')}</button> · <button type="button" className={styles.link} disabled={busy} onClick={()=>void revise(item,'resolved','')}>{t('clinical.contextClosed')}</button></div>}</article>;
 const groupRow=(group:typeof items)=><div key={group[0].id} data-context-group>{row(group[0])}{group.length>1&&<details><summary>Ίδια καταγραφή σε {group.length-1} ακόμη {group.length===2?'επίσκεψη':'επισκέψεις'}</summary>{group.slice(1).map(row)}</details>}</div>;
 return <section className={styles.section}><span className="kicker">{t('current.m055')}</span>{groups.slice(0,3).map(groupRow)}{!active.length&&<p className={styles.muted}>{t('clinical.noActiveContext')}</p>}{groups.length>3&&<details><summary>{t('clinical.moreActivePrefix')} {groups.length-3}</summary>{groups.slice(3).map(groupRow)}</details>}{items.some(i=>i.history.length>0)&&<details><summary>{t('clinical.contextHistory')}</summary>{items.filter(i=>i.history.length>0).map(i=><article key={i.id}><p>{t('clinical.firstConfirmationPrefix')} {formatClinicDateTime(i.approvedAt)} · {i.original}</p>{i.history.map(r=><p key={r.id}>{formatClinicDateTime(r.created_at)} · {r.action==='resolved'?t('clinical.contextClosed'):t('common.updated')} · {r.content}</p>)}</article>)}</details>}{error&&<p role="alert">{systemMessage(error)}</p>}</section>;
}
