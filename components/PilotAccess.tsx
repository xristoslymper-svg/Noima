'use client';
import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useAccountSession} from '@/components/AccountSessionBoundary';
import {notifyAccountChange} from '@/lib/pilot/browser-session';
export default function PilotAccess({activate=false}:{activate?:boolean}){
 const account=useAccountSession();
 const [emailSignup,setEmailSignup]=useState(false),[emailRecovery,setEmailRecovery]=useState(false),[optionsLoading,setOptionsLoading]=useState(true);
 const [signup,setSignup]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[google,setGoogle]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{
  let disposed=false;
  if(!activate)void fetch('/api/auth/options').then(async r=>{if(!r.ok)throw new Error('options_unavailable');return r.json()}).then(d=>{if(!disposed){setGoogle(d.google===true);setEmailSignup(d.email_signup===true);setEmailRecovery(d.email_recovery===true);if(d.email_signup!==true)setSignup(false)}}).catch(()=>{if(!disposed)setError('Δεν φορτώθηκαν οι διαθέσιμοι τρόποι σύνδεσης. Ανανεώστε τη σελίδα και δοκιμάστε ξανά.')}).finally(()=>{if(!disposed)setOptionsLoading(false)});
  const q=new URLSearchParams(location.search);if(q.get('error')==='oauth')setError('Ο σύνδεσμος σύνδεσης δεν είναι έγκυρος ή έχει λήξει. Συνδεθείτε ξανά ή ζητήστε νέο σύνδεσμο.');if(q.get('password')==='updated')setMessage('Ο κωδικός άλλαξε. Συνδεθείτε με τον νέο κωδικό.');if(q.get('session')==='expired')setMessage('Η σύνδεσή σας έληξε. Συνδεθείτε ξανά για να συνεχίσετε.');
  return ()=>{disposed=true};
 },[activate]);
 async function googleLogin(){setBusy(true);setError('');try{const r=await fetch('/api/pilot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'google'})});const d=await r.json();if(!r.ok)throw new Error(d.error);location.assign(d.url)}catch(e){setError(e instanceof Error?e.message:'Δεν ολοκληρώθηκε.');setBusy(false)}}
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{
  const r=await fetch('/api/pilot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(activate?{action:'join',name}:{action:signup?'signup':'login',email,password})});const d=await r.json();if(!r.ok)throw new Error(d.error);
  if(d.confirmation_required){setMessage('Ελέγξτε τα εισερχόμενα και τα ανεπιθύμητα για το email επιβεβαίωσης. Αν έχετε ήδη λογαριασμό, συνδεθείτε ή χρησιμοποιήστε την επαναφορά κωδικού.');setSignup(false);setPassword('');}else {notifyAccountChange();window.location.replace(activate?'/':'/pilot');}
 }catch(e){setError(e instanceof Error?e.message:'Δεν ολοκληρώθηκε.')}finally{setBusy(false)}}
 return <main className="pilot-page"><section className="pilot-card"><div className="brand-mark">Ψ</div><span className="kicker">NOIMA · ΠΙΛΟΤΙΚΗ ΔΟΚΙΜΗ</span><h1>{activate?'Ο προσωπικός σας χώρος':signup?'Δημιουργία λογαριασμού':'Καλώς ήρθατε'}</h1>{activate&&<p className="account-email">{account?.email}</p>}<p>{activate?'Συμπληρώστε το όνομά σας μία φορά. Ο προσωπικός σας χώρος ξεκινά άδειος και είναι ορατός μόνο σε εσάς.':'Δοκιμάστε το NOIMA με υποθετικούς ασθενείς και περιστατικά. Κάθε λογαριασμός έχει τον δικό του προσωπικό χώρο.'}</p>{!activate&&google&&<button disabled={busy} onClick={()=>void googleLogin()}>Συνέχεια με Google</button>}{!activate&&google&&<small className="login-method-hint">ή με email και κωδικό</small>}<form onSubmit={submit}><fieldset disabled={busy}>
 {activate?<><label>Ονοματεπώνυμο<input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label></>:<><label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Κωδικός πρόσβασης<input type="password" required minLength={signup?12:1} maxLength={128} autoComplete={signup?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>{signup&&<small>Τουλάχιστον 12 χαρακτήρες. Το email επιβεβαιώνεται πριν από την πρώτη χρήση.</small>}</>}
 <button className="pilot-primary" type="submit">{busy?'Παρακαλώ περιμένετε…':activate?'Έναρξη':signup?'Δημιουργία λογαριασμού':'Σύνδεση'}</button></fieldset></form>
 {!activate&&!signup&&<>{emailRecovery&&<Link href="/forgot-password">Ξέχασα τον κωδικό;</Link>}<small>Αν συνδέεστε με Google, επιλέξτε «Συνέχεια με Google» με το ίδιο email.</small></>}
 {error&&<p role="alert" className="pilot-error">{error}</p>}{message&&<p role="status">{message}</p>}
 {!activate&&emailSignup&&<button disabled={busy} className="pilot-text-button" onClick={()=>{setSignup(!signup);setPassword('');setError('');setMessage('')}}>{signup?'Έχω ήδη λογαριασμό':'Δημιουργία λογαριασμού'}</button>}
 {!activate&&!optionsLoading&&!emailSignup&&<small>Οι νέοι λογαριασμοί δημιουργούνται προς το παρόν με Google. Αν έχετε ήδη κωδικό NOIMA, μπορείτε να συνδεθείτε με αυτόν.</small>}
 {activate&&<Link href="/account">Λογαριασμός / αποσύνδεση</Link>}
 </section></main>;
}
