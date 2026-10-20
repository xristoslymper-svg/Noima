'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useTranslations} from 'next-intl';
import {useReducer,useState} from 'react';
import {remoteSlot,type Slot} from '@/lib/calendar/google-sync';
import {createPreviewState,previewReducer} from '@/lib/calendar/google-preview-state';
function clock(slot:Slot){
 if(slot.cancelled)return 'Ακυρωμένο';
 const format=new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'});
 return format.format(new Date(slot.start))+' – '+new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit'}).format(new Date(slot.end));
}
export default function GoogleCalendarPreview(){
 const ui=useUiText();

 const t=useTranslations();

 const [state,dispatch]=useReducer(previewReducer,undefined,()=>createPreviewState());
 const [consent,setConsent]=useState(false);
 const current=state.remotes[0],slot=current&&remoteSlot(current,state.local),comparison=state.comparison;
 return <section className="mailbox-settings"><p><strong>{t('current.m081')}</strong></p><p>{t('current.m082')}</p>
 <h2>{t('current.m083')}</h2><p>{t('current.m084')}</p>
 {!state.connected?<><label className="pilot-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('current.m085')}</label><div className="pilot-actions"><button disabled={!consent} onClick={()=>dispatch({type:'connect'})}>{t('current.m086')}</button></div></>:<><p className="mailbox-connected">{t('current.m087')}</p><button onClick={()=>{dispatch({type:'disconnect'});setConsent(false)}}>{t('current.m088')}</button></>}
 <hr/><h2>{t('current.m089')}</h2><p>NOIMA: <strong>{clock(state.local)}</strong></p><p>Google: <strong>{slot?clock(slot):ui('Δεν έχει δημιουργηθεί')}</strong></p><small>{t('current.m090')}</small>
 <div className="pilot-actions"><button disabled={!state.connected} onClick={()=>dispatch({type:'sync'})}>{t('current.m091')}</button><button onClick={()=>dispatch({type:'reset'})}>{t('current.m092')}</button></div>
 {comparison&&<section aria-labelledby="calendar-conflict-title"><hr/><h2 id="calendar-conflict-title">{t('current.m093')}</h2><p>{t('current.m094')}</p><dl><dt>{t('current.m095')}</dt><dd>{clock(comparison.local)}</dd><dt>{t('current.m096')}</dt><dd>{clock(comparison.remote)}</dd></dl><div className="pilot-actions"><button onClick={()=>dispatch({type:'resolve',choice:'local',expected:comparison})}>Διατήρηση NOIMA · {clock(comparison.local)}</button><button onClick={()=>dispatch({type:'resolve',choice:'remote',expected:comparison})}>Διατήρηση Google · {clock(comparison.remote)}</button><button onClick={()=>dispatch({type:'dismiss'})}>{t('current.m097')}</button></div></section>}
 <details className="account-details"><summary>{t('current.m098')}</summary><p>{t('current.m099')}</p><div className="pilot-actions"><button disabled={!state.connected||state.local.cancelled} onClick={()=>dispatch({type:'local-move'})}>{t('current.m100')}</button><button disabled={!state.connected||!current||current.status==='cancelled'} onClick={()=>dispatch({type:'remote-move'})}>{t('current.m101')}</button><button disabled={!state.connected||state.local.cancelled} onClick={()=>dispatch({type:'local-cancel'})}>{t('current.m102')}</button><button disabled={!state.connected||!current||current.status==='cancelled'} onClick={()=>dispatch({type:'remote-cancel'})}>{t('current.m103')}</button></div></details><p role="status" aria-live="polite">{state.message}</p><small>{t('current.m104')}</small></section>
}
