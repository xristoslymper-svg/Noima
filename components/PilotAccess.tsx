'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useTranslations} from 'next-intl';
import {useSystemMessage} from '@/i18n/system-message';
import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import {useAccountSession} from '@/components/AccountSessionBoundary';
import {notifyAccountChange} from '@/lib/pilot/browser-session';
export default function PilotAccess({activate=false}:{activate?:boolean}){
 const ui=useUiText();

 const t=useTranslations();
 const systemMessage=useSystemMessage();

 const account=useAccountSession();
 const [emailSignup,setEmailSignup]=useState(false),[emailRecovery,setEmailRecovery]=useState(false),[optionsLoading,setOptionsLoading]=useState(true);
 const [signup,setSignup]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[google,setGoogle]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{
  let disposed=false;
  if(!activate)void fetch('/api/auth/options').then(async r=>{if(!r.ok)throw new Error('options_unavailable');return r.json()}).then(d=>{if(!disposed){setGoogle(d.google===true);setEmailSignup(d.email_signup===true);setEmailRecovery(d.email_recovery===true);if(d.email_signup!==true)setSignup(false)}}).catch(()=>{if(!disposed)setError(t('errors.authOptions'))}).finally(()=>{if(!disposed)setOptionsLoading(false)});
  const q=new URLSearchParams(location.search);if(q.get('error')==='oauth')setError(t('errors.authLinkExpired'));if(q.get('password')==='updated')setMessage(t('settings.passwordUpdatedLogin'));if(q.get('session')==='expired')setMessage(t('settings.sessionExpired'));
  return ()=>{disposed=true};
 },[activate]);
 async function googleLogin(){setBusy(true);setError('');try{const r=await fetch('/api/pilot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'google'})});const d=await r.json();if(!r.ok)throw new Error(d.error);location.assign(d.url)}catch(e){setError(e instanceof Error?e.message:t('errors.actionFailed'));setBusy(false)}}
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{
  const r=await fetch('/api/pilot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(activate?{action:'join',name}:{action:signup?'signup':'login',email,password})});const d=await r.json();if(!r.ok)throw new Error(d.error);
  if(d.confirmation_required){setMessage(t('settings.confirmationEmailHelp'));setSignup(false);setPassword('');}else {notifyAccountChange();window.location.replace(activate?'/':'/pilot');}
 }catch(e){setError(e instanceof Error?e.message:t('errors.actionFailed'))}finally{setBusy(false)}}
 return <AuthShell languageSelection={!activate&&!signup}><h1>{activate?ui('Ο προσωπικός σας χώρος'):signup?ui('Δημιουργία λογαριασμού') :t('polish.m008')}</h1>{activate&&<p className="account-email">{account?.email}</p>}<p>{activate?ui('Συμπληρώστε το όνομά σας μία φορά. Ο προσωπικός σας χώρος ξεκινά άδειος και είναι ορατός μόνο σε εσάς.'):signup?t('polish.m009'):t('polish.m010')}</p>{!activate&&google&&<button className="auth-google" disabled={busy} onClick={()=>void googleLogin()}>{t('settings.continueGoogle')}</button>}{!activate&&google&&<small className="login-method-hint">{t('settings.emailAlternative')} NOIMA</small>}<form onSubmit={submit}><fieldset disabled={busy}>
 {activate?<><label>{t('common.fullName')}<input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label></>:<><label>Email<input type="email" required placeholder="doctor@example.com" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>{t('settings.password')}<input type="password" placeholder={signup?t('polish.m011'):t('polish.m012')} required minLength={signup?12:1} maxLength={128} autoComplete={signup?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>{signup&&<small>{t('settings.passwordSignupHelp')}</small>}</>}
 <button className="pilot-primary" type="submit">{busy?t('common.pleaseWait'):activate?t('common.getStarted'):signup?t('settings.createAccount'):t('settings.signIn')}</button></fieldset></form>
 {!activate&&!signup&&<>{emailRecovery&&<Link href="/forgot-password">{t('settings.forgotPassword')}</Link>}<small>{t('settings.googleAccountHelp')}</small></>}
 {error&&<p role="alert" className="pilot-error">{systemMessage(error)}</p>}{message&&<p role="status">{systemMessage(message)}</p>}
 {!activate&&emailSignup&&<button disabled={busy} className="pilot-text-button auth-switch" onClick={()=>{setSignup(!signup);setPassword('');setError('');setMessage('')}}>{signup?t('settings.existingAccount'):t('settings.createAccount')}</button>}
 {!activate&&!optionsLoading&&!emailSignup&&<small>{t('settings.googleSignupHelp')}</small>}
 {activate&&<Link href="/account">{t('settings.accountSignOut')}</Link>}
 </AuthShell>;
}
