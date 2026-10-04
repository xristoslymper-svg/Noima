'use client';

import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';

const URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://mgpnaxaquzeoomxdzhic.supabase.co';
const KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_g4MJzSlAYzIFAt9glM_WeQ_UcP-yheG';
const SESSION_KEY='noima-pilot-session';
const TESTER_KEY='noima-demo-tester-id';
const PRODUCTION_URL='https://noima-pi.vercel.app';
type Session={access_token:string;refresh_token:string;expires_in:number;expires_at?:number};
function cookie(token:string,maxAge:number){document.cookie=`noima-access-token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`}
function clear(){localStorage.removeItem(SESSION_KEY);document.cookie='noima-access-token=; Path=/; Max-Age=0; SameSite=Lax; Secure'}
async function identity(token:string){
 const r=await fetch(`${URL}/rest/v1/rpc/pilot_identity`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'});
 if(!r.ok)throw new Error('identity_failed'); return r.json() as Promise<{workspace_id:string;full_name:string}>;
}
async function persist(s:Session){
 const session={...s,expires_at:Math.floor(Date.now()/1000)+s.expires_in};
 const who=await identity(session.access_token);
 if(!who?.workspace_id)throw new Error('workspace_missing');
 localStorage.setItem(SESSION_KEY,JSON.stringify(session));localStorage.setItem(TESTER_KEY,who.workspace_id);cookie(session.access_token,s.expires_in);
 return who;
}
export default function PilotAuthGate({children}:{children:ReactNode}){
 const path=usePathname(); const isPublic=path.startsWith('/assessment')||path.startsWith('/test/');
 const [ready,setReady]=useState(isPublic),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[recovery,setRecovery]=useState<Session|null>(null),[newPassword,setNewPassword]=useState('');
 useEffect(()=>{if(isPublic)return;void(async()=>{try{
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));if(hash.get('type')==='recovery'&&hash.get('access_token')&&hash.get('refresh_token')){const s:Session={access_token:hash.get('access_token')!,refresh_token:hash.get('refresh_token')!,expires_in:Number(hash.get('expires_in')||3600)};setRecovery(s);history.replaceState(null,'',location.pathname);setReady(true);return}
  const raw=localStorage.getItem(SESSION_KEY);if(!raw){setReady(true);return}let s=JSON.parse(raw) as Session;
  if(!s.expires_at||s.expires_at<Math.floor(Date.now()/1000)+60){
   const r=await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
   if(!r.ok)throw new Error('refresh_failed');s=await r.json();
  }
  const who=await persist(s);setName(who.full_name||'');setReady(true);
 }catch{clear();setReady(true)}})()},[isPublic]);
 async function resetPassword(){if(!email.trim()){setError('Γράψτε πρώτα το email σας.');return}setBusy(true);setError('');setNotice('');try{const redirectTo=`${PRODUCTION_URL}/?recovery=1`;const r=await fetch(`${URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email:email.trim()})});if(!r.ok)throw new Error('reset_failed');setNotice('Στείλαμε σύνδεσμο επαναφοράς στο email σας.')}catch{setError('Δεν ήταν δυνατή η αποστολή email επαναφοράς. Δοκιμάστε ξανά.')}finally{setBusy(false)}}
 async function finishRecovery(e:FormEvent){e.preventDefault();if(!recovery)return;if(newPassword.length<8){setError('Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');return}setBusy(true);setError('');try{const r=await fetch(`${URL}/auth/v1/user`,{method:'PUT',headers:{apikey:KEY,Authorization:`Bearer ${recovery.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({password:newPassword})});if(!r.ok)throw new Error('update_failed');await persist(recovery);setRecovery(null);setNotice('Ο κωδικός άλλαξε επιτυχώς.');location.replace(PRODUCTION_URL)}catch{setError('Ο σύνδεσμος επαναφοράς έληξε ή δεν είναι πλέον έγκυρος. Ζητήστε νέο email.')}finally{setBusy(false)}}
 async function login(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const r=await fetch(`${URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password})});
  if(!r.ok)throw new Error('login_failed');const who=await persist(await r.json());setName(who.full_name||'');location.reload();
 }catch{setError('Το email ή ο κωδικός δεν είναι σωστός.');setBusy(false)}}
 if(isPublic)return <>{children}</>;
 if(!ready)return <main className="pilot-auth-shell"><div className="pilot-auth-card"><strong>Ψ</strong><p>Φόρτωση ασφαλούς χώρου…</p></div></main>;
 if(recovery)return <main className="pilot-auth-shell"><form className="pilot-auth-card" onSubmit={finishRecovery}><strong className="pilot-auth-mark">Ψ</strong><h1>Νέος κωδικός</h1><p>Ορίστε τον νέο κωδικό για τον λογαριασμό σας.</p><label>Νέος κωδικός<input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={8} required/></label>{error&&<div className="pilot-auth-error">{error}</div>}<button disabled={busy}>{busy?'Αποθήκευση…':'Αποθήκευση νέου κωδικού'}</button></form></main>;
 if(!localStorage.getItem(SESSION_KEY))return <main className="pilot-auth-shell"><form className="pilot-auth-card" onSubmit={login}><strong className="pilot-auth-mark">Ψ</strong><h1>Καλώς ήρθατε</h1><p>Συνδεθείτε στον δοκιμαστικό κλινικό σας χώρο.</p><label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Κωδικός<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<div className="pilot-auth-error">{error}</div>}{notice&&<div className="pilot-auth-notice">{notice}</div>}<button disabled={busy}>{busy?'Σύνδεση…':'Σύνδεση'}</button><button type="button" className="pilot-auth-link" onClick={resetPassword} disabled={busy}>Ξέχασα τον κωδικό</button></form></main>;
 return <>{children}</>;
}
