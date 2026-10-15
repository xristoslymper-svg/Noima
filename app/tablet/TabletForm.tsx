'use client';
import {useSystemMessage} from '@/i18n/system-message';

import {useTranslations} from 'next-intl';

import Link from 'next/link';import {useCallback,useEffect,useRef,useState} from 'react';import PatientIntakeForm,{type IntakePayload} from '@/components/intake/PatientIntakeForm';
export default function TabletPage(){
 const systemMessage=useSystemMessage();

 const t=useTranslations();
const [deviceToken,setDeviceToken]=useState(''),[payload,setPayload]=useState<IntakePayload|null>(null),[error,setError]=useState(''),[pairing,setPairing]=useState(false),busy=useRef(false);
 useEffect(()=>{try{setDeviceToken(localStorage.getItem('noima-tablet-token')||'')}catch{}},[]);
 const publicCall=useCallback(async(body:Record<string,unknown>)=>{const r=await fetch('/api/intake/public',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error);return d},[]);
 useEffect(()=>{if(!deviceToken)return;let active=true;const poll=async()=>{if(busy.current)return;busy.current=true;try{const d=await publicCall({action:'device_poll',deviceToken});if(!active)return;if(d.status==='waiting')setPayload(null);else setPayload(d);setError('')}catch(e){if(active)setError(e instanceof Error?e.message:t('errors.tabletConnect'))}finally{busy.current=false}};void poll();const timer=setInterval(()=>void poll(),3500);return()=>{active=false;clearInterval(timer)}},[deviceToken,publicCall]);
 async function pair(){setPairing(true);setError('');try{const r=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register_device',label:t('history.receptionTablet')})});const d=await r.json();if(!r.ok)throw new Error(d.error);localStorage.setItem('noima-tablet-token',d.deviceToken);setDeviceToken(d.deviceToken)}catch(e){setError(e instanceof Error?e.message:t('errors.tabletConnectionFailed'))}finally{setPairing(false)}}
 if(!deviceToken)return <main className="tablet-wait"><div className="brand-mark">Ψ</div><h1>{t('history.receptionTablet')}</h1><p>{t('history.tabletSetupHelp')}</p><button disabled={pairing} onClick={()=>void pair()}>{pairing?t('common.connecting'):t('history.connectTablet')}</button>{error&&<p role="alert">{systemMessage(error)}</p>}<small>{t('history.tabletSignInPrefix')} <Link href="/login">{t('history.signInNoima')}</Link>  {t('history.returnHereSuffix')}</small></main>;
 if(payload)return <PatientIntakeForm payload={payload} onSubmit={async(identity,history,psychometrics)=>{const d=await publicCall({action:'device_submit',deviceToken,intakeId:payload.id,identity,history,psychometrics});setPayload(null);return d}}/>;
 return <main className="tablet-wait"><div className="brand-mark">Ψ</div><span className="kicker">{t('history.connectedKicker')}</span><h1>{t('history.receptionTablet')}</h1><p>{error||t('history.tabletWaiting')}</p><div className="tablet-pulse"/><button className="tablet-unpair" onClick={()=>{localStorage.removeItem('noima-tablet-token');setDeviceToken('')}}>{t('history.disconnectTablet')}</button></main>}
