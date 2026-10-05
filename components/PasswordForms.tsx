'use client';
import {useState,type FormEvent} from 'react';

async function post(body:Record<string,unknown>){
 const response=await fetch('/api/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||'Η ενέργεια δεν ολοκληρώθηκε.');
 return data;
}

export function PasswordResetRequest(){
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{await post({action:'request_reset',email});setMessage('Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς. Ελέγξτε και τα ανεπιθύμητα.');}
  catch(e){setError(e instanceof Error?e.message:'Δεν ολοκληρώθηκε.')}
  finally{setBusy(false)}
 }
 return <form onSubmit={submit}><fieldset disabled={busy}><label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="pilot-primary" type="submit">{busy?'Αποστολή…':'Αποστολή συνδέσμου'}</button></fieldset>{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="pilot-error">{error}</p>}</form>;
}

export function PasswordChangeForm({recovery=false}:{recovery?:boolean}){
 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();setError('');setMessage('');
  if(password!==confirm){setError('Οι δύο νέοι κωδικοί δεν ταιριάζουν.');return}
  setBusy(true);
  try{
   await post(recovery?{action:'reset',password}:{action:'change',current_password:current,password});
   if(recovery){window.location.assign('/login?password=updated');return}
   setCurrent('');setPassword('');setConfirm('');setMessage('Ο κωδικός άλλαξε.');
  }catch(e){setError(e instanceof Error?e.message:'Δεν ολοκληρώθηκε.')}finally{setBusy(false)}
 }
 return <form onSubmit={submit}><fieldset disabled={busy}>{!recovery&&<label>Τωρινός κωδικός<input type="password" required maxLength={128} autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></label>}<label>Νέος κωδικός<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Επανάληψη νέου κωδικού<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><small>Τουλάχιστον 12 χαρακτήρες.</small><button className="pilot-primary" type="submit">{busy?'Αποθήκευση…':recovery?'Ορισμός νέου κωδικού':'Αλλαγή κωδικού'}</button></fieldset>{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="pilot-error">{error}</p>}</form>;
}
