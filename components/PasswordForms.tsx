'use client';
import {useTranslations} from 'next-intl';
import {useSystemMessage} from '@/i18n/system-message';
import {useState,type FormEvent} from 'react';
import {recoveryTokenFromFragment} from '@/lib/pilot/recovery-link';
import {notifyAccountChange} from '@/lib/pilot/browser-session';

async function post(body:Record<string,unknown>){
 const response=await fetch('/api/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||'Η ενέργεια δεν ολοκληρώθηκε.');
 return data;
}

export function PasswordResetRequest(){
 const t=useTranslations();
 const systemMessage=useSystemMessage();

 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{await post({action:'request_reset',email});setMessage(t('settings.passwordResetSent'));}
  catch(e){setError(e instanceof Error?e.message:t('errors.actionFailed'))}
  finally{setBusy(false)}
 }
 return <form onSubmit={submit}><fieldset disabled={busy}><label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="pilot-primary" type="submit">{busy?t('common.sending'):t('settings.sendResetLink')}</button></fieldset>{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="pilot-error">{systemMessage(error)}</p>}</form>;
}

export function PasswordChangeForm({recovery=false}:{recovery?:boolean}){
 const t=useTranslations();

 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();setError('');setMessage('');
  if(password!==confirm){setError(t('validation.passwordMismatch'));return}
  setBusy(true);
  try{
   const tokenHash=recovery?recoveryTokenFromFragment(window.location.hash):undefined;
   await post(recovery?{action:'reset',password,...(tokenHash!==undefined?{token_hash:tokenHash}:{})}:{action:'change',current_password:current,password});
   if(recovery){notifyAccountChange();window.location.replace('/login?password=updated');return}
   setCurrent('');setPassword('');setConfirm('');setMessage(t('settings.passwordUpdated'));
  }catch(e){setError(e instanceof Error?e.message:t('errors.actionFailed'))}finally{setBusy(false)}
 }
 return <form onSubmit={submit}><fieldset disabled={busy}>{!recovery&&<label>{t('settings.currentPassword')}<input type="password" required maxLength={128} autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></label>}<label>{t('settings.newPassword')}<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>{t('settings.confirmPassword')}<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><small>{t('validation.passwordMinimum')}</small><button className="pilot-primary" type="submit">{busy?t('common.saving'):recovery?t('settings.setPassword'):t('settings.changePassword')}</button></fieldset>{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="pilot-error">{error}</p>}</form>;
}
