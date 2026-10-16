'use client';
import {useTranslations} from 'next-intl';

import {useEffect,useState} from 'react';
export type MailboxStatus={mailbox:{provider:string;email:string}|null;providers:{google:boolean;microsoft:boolean}};
export default function MailboxSettings(){
 const t=useTranslations();
const [status,setStatus]=useState<MailboxStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[connected,setConnected]=useState<string|null>(null);
 async function load(){const r=await fetch('/api/mailbox',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error);setStatus(d)}
 useEffect(()=>{setConnected(new URLSearchParams(window.location.search).get('mail'));void load().catch(()=>setError(t('errors.mailboxLoad')))},[]);
 async function action(action:string,provider?:string){setBusy(true);setError('');try{const r=await fetch('/api/mailbox',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,provider})});const d=await r.json();if(!r.ok)throw new Error(d.error);if(d.url)location.assign(d.url);else await load()}catch(e){setError(e instanceof Error?e.message:t('errors.actionFailed'))}finally{setBusy(false)}}

 return <section className="mailbox-settings"><h2>{t('settings.sendingEmail')}</h2><p>{t('settings.mailboxHelp')}</p>{status?.mailbox&&<p className="mailbox-connected">{t('settings.mailboxConnected')} <strong>{status.mailbox.email}</strong></p>}<div className="pilot-actions"><button disabled={busy||!status?.providers.google} onClick={()=>void action('connect','google')}>{t('settings.connectGoogle')}</button><button disabled={busy||!status?.providers.microsoft} onClick={()=>void action('connect','microsoft')}>{t('settings.connectMicrosoft')}</button>{status?.mailbox&&<button disabled={busy} onClick={()=>void action('disconnect')}>{t('settings.disconnectEmail')}</button>}</div>{status&&(!status.providers.google||!status.providers.microsoft)&&<small>{t('settings.mailboxProviderHelp')}</small>}{connected==='connected'&&<p role="status">{t('settings.mailboxSuccess')}</p>}{(error||connected==='error')&&<p role="alert">{error||t('errors.mailboxConnect')}</p>}</section>
}
