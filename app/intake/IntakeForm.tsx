'use client';
import {useSystemMessage} from '@/i18n/system-message';

import {useTranslations} from 'next-intl';

import {useEffect,useState} from 'react';import {CheckCircle2} from 'lucide-react';import PatientIntakeForm,{type IntakePayload} from '@/components/intake/PatientIntakeForm';
export default function IntakePage(){
 const systemMessage=useSystemMessage();

 const t=useTranslations();
const [payload,setPayload]=useState<IntakePayload|null>(null),[token,setToken]=useState(''),[error,setError]=useState(''),[terminal,setTerminal]=useState('');const printMode=typeof window!=='undefined'&&new URLSearchParams(location.search).get('print')==='1';
 useEffect(()=>{const t=location.hash.slice(1);setToken(t);if(!/^[a-f0-9]{64}$/.test(t)){setError('Ο σύνδεσμος δεν είναι έγκυρος.');return}void call({action:'open',token:t}).then(d=>{if(d.status==='submitted'||d.status==='conflict')setTerminal(d.status);else setPayload(d)}).catch(e=>setError(e.message))},[]);
 async function call(body:Record<string,unknown>){const r=await fetch('/api/intake/public',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error);return d}
 if(terminal)return <main className="intake-finished patient-intake-finished"><CheckCircle2 className="intake-finished-check" size={42}/><div className="brand-mark">Ψ</div><h1>{terminal==='submitted'?t('history.alreadyComplete'):t('history.alreadyReceived')}</h1><p>{terminal==='submitted'?t('history.alreadySentHelp'):t('history.receivedIdentityHelp')}</p><small>{t('history.privateAnswersHelp')}</small></main>;
 if(error)return <main className="intake-finished"><div className="brand-mark">Ψ</div><h1>{t('errors.linkUnavailable')}</h1><p>{systemMessage(error)}</p></main>;
 if(!payload)return <main className="intake-finished"><p>{t('common.loading')}</p></main>;
 return <PatientIntakeForm payload={payload} printMode={printMode} onSubmit={async(identity,history,psychometrics)=>call({action:'submit',token,identity,history,psychometrics})}/>}
