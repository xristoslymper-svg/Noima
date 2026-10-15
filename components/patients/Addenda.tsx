'use client';
import {useSystemMessage} from '@/i18n/system-message';

import {useLocale} from 'next-intl';

import {useTranslations} from 'next-intl';

import {useCallback,useEffect,useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {demoPost} from '@/lib/patients/demo-client';
import {formatClinicDateTime} from '@/lib/clinic-time';
export default function Addenda({bundle,sessionId,reload,registerFlusher,onDirtyChange}:{bundle:PatientBundle;sessionId:string;reload:()=>Promise<unknown>;registerFlusher?:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange?:(key:string,dirty:boolean)=>void}){
 const systemMessage=useSystemMessage();

const t=useTranslations();

 const locale=useLocale();

 

 const [open,setOpen]=useState(false),[content,setContent]=useState(''),[reason,setReason]=useState(''),[kind,setKind]=useState('addendum'),[request,setRequest]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=open&&(busy||Boolean(content.trim())||Boolean(reason.trim()));const guardKey='addendum:'+sessionId;
 const guard=useCallback(async()=>{if(pending)throw new Error(t('visits.saveOrCancelAddendum'))},[pending]);
 useEffect(()=>registerFlusher?.(guardKey,guard),[guardKey,guard,registerFlusher]);
 useEffect(()=>{onDirtyChange?.(guardKey,pending);return()=>onDirtyChange?.(guardKey,false)},[guardKey,pending,onDirtyChange]);
 function discard(){if(busy)return;setOpen(false);setContent('');setReason('');setError('');setRequest('')}

 async function save(){setBusy(true);setError('');try{await demoPost({action:'addendum',session_id:sessionId,request_id:request,kind,reason,content});await reload();setOpen(false);setContent('');setReason('');setRequest('')}catch(e){setError(e instanceof Error?e.message:t('common.notSaved'))}finally{setBusy(false)}}
 return <section className="addenda"><h3>{t('visits.laterAddenda')}</h3>{bundle.addenda.filter(x=>x.session_id===sessionId).map(x=><article key={x.id}><strong>{x.kind==='correction'?t('clinical.correction'):t('common.add')} · {formatClinicDateTime(x.created_at, locale)}</strong><p>{x.content}</p><small>{t('visits.reasonPrefix')} {x.reason}  {t('visits.clinicianEntrySuffix')}</small></article>)}
 {!open?<button onClick={()=>{setRequest(crypto.randomUUID());setOpen(true)}}>{t('visits.newAddendum')}</button>:<div><p>{t('visits.originalVisitUnchanged')}</p><label>{t('common.type')}<select disabled={busy} value={kind} onChange={e=>setKind(e.target.value)}><option value="addendum">{t('common.add')}</option><option value="correction">{t('clinical.correction')}</option></select></label><label>{t('common.reason')}<input disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label><label>{t('common.text')}<textarea disabled={busy} rows={5} value={content} onChange={e=>setContent(e.target.value)}/></label>{error&&<p role="alert">{systemMessage(error)}</p>}<button disabled={busy||!content.trim()||!reason.trim()} onClick={()=>void save()}>{t('visits.saveAddendum')}</button><button disabled={busy} onClick={discard}>{t('common.cancel')}</button></div>}</section>
}
