'use client';
import {useSystemMessage} from '@/i18n/system-message';

import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import MailboxSettings from '@/components/mail/MailboxSettings';
import {PasswordChangeForm} from '@/components/PasswordForms';
import {useAccountSession} from '@/components/AccountSessionBoundary';
import {notifyAccountChange} from '@/lib/pilot/browser-session';
export default function Account(){
 const systemMessage=useSystemMessage();

 const t=useTranslations();

 const account=useAccountSession(),identity=account?.identity,email=account?.email,hasPassword=account?.has_password;
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[category,setCategory]=useState('bug'),[feedback,setFeedback]=useState(''),[confirm,setConfirm]=useState(false);
 async function action(name:string,extra:Record<string,unknown>={}){setBusy(true);setError('');setMessage('');try{const r=await fetch('/api/pilot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,...extra})});const d=await r.json();if(!r.ok)throw new Error(d.error);if(name==='feedback'){setMessage(t('settings.feedbackSaved'));setFeedback('')}else {notifyAccountChange();window.location.replace(name==='logout'?'/login':'/');}}catch(e){setError(e instanceof Error?e.message:t('errors.actionFailed'))}finally{setBusy(false)}}
 function submit(e:FormEvent){e.preventDefault();void action('feedback',{category,message:feedback,page:location.pathname})}
 return <main className="pilot-page"><section className="pilot-card pilot-account"><Link href="/">{t('navigation.backToApp')}</Link><h1>{identity?.full_name||t('settings.myAccount')}</h1><p className="account-email">{email}</p><p>{t('settings.accountOwnership')}</p><button disabled={busy} onClick={()=>void action('logout')}>{t('settings.signOut')}</button>{identity&&<>{hasPassword&&<><hr/><details className="account-details"><summary>{t('settings.changePassword')}</summary><PasswordChangeForm/></details></>}<hr/><MailboxSettings/><hr/><h2>{t('settings.feedbackTitle')}</h2><p>{t('settings.feedbackHelp')}</p><form onSubmit={submit}><fieldset disabled={busy}><label>{t('settings.feedbackType')}<select value={category} onChange={e=>setCategory(e.target.value)}><option value="bug">{t('settings.feedbackBug')}</option><option value="experience">{t('settings.feedbackExperience')}</option><option value="idea">{t('settings.feedbackIdea')}</option></select></label><label>{t('settings.feedbackText')}<textarea required minLength={5} maxLength={4000} rows={5} value={feedback} onChange={e=>setFeedback(e.target.value)}/></label><button className="pilot-primary" type="submit">{t('settings.feedbackSave')}</button></fieldset></form><hr/><details className="account-details"><summary>{t('settings.manageTrial')}</summary><p>{t('settings.resetWorkspaceHelp')}</p><label className="pilot-check"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>{t('settings.confirmWorkspaceChange')}</label><div className="pilot-actions"><button disabled={busy||!confirm} onClick={()=>void action('reset',{confirm:true})}>{t('settings.newTrial')}</button>{identity.can_restore&&<button disabled={busy||!confirm} onClick={()=>void action('restore',{confirm:true})}>{t('settings.restoreWorkspace')}</button>}</div></details></>}{message&&<p role="status">{systemMessage(message)}</p>}{error&&<p role="alert" className="pilot-error">{systemMessage(error)}</p>}</section></main>;
}
