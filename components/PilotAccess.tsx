'use client';
import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
export default function PilotAccess({activate=false}:{activate?:boolean}){
 const [signup,setSignup]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[google,setGoogle]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{void fetch('/api/auth/options').then(r=>r.json()).then(d=>setGoogle(d.google===true)).catch(()=>{});const q=new URLSearchParams(location.search);if(q.get('error')==='oauth')setError('Η σύνδεση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.');if(q.get('password')==='updated')setMessage('Ο κωδικός άλλαξε. Συνδεθείτε με τον νέο κωδικό.')},[]);
 async function googleLogin(){setBusy(true);setError('');try{const r=await fetch('/api/pilot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'google'})});const d=await r.json();if(!r.ok)throw new Error(d.error);location.assign(d.url)}catch(e){setError(e instanceof Error?e.message:'Δεν ολοκληρώθηκε.');setBusy(false)}}
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{
  const r=await fetch('/api/pilot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(activate?{action:'join',name}:{action:signup?'signup':'login',email,password})});const d=await r.json();if(!r.ok)throw new Error(d.error);
  if(d.confirmation_required){setMessage('Επιβεβαιώστε το email από το μήνυμα που λάβατε και συνδεθείτε εδώ. Μετά θα δημιουργήσετε τον προσωπικό σας χώρο.');setSignup(false);setPassword('');}else {window.location.assign(activate?'/':'/pilot');}
 }catch(e){setError(e instanceof Error?e.message:'Δεν ολοκληρώθηκε.')}finally{setBusy(false)}}
 return <main className="pilot-page"><section className="pilot-card"><div className="brand-mark">Ψ</div><span className="kicker">NOIMA · ΠΙΛΟΤΙΚΗ ΔΟΚΙΜΗ</span><h1>{activate?'Ο προσωπικός σας χώρος':signup?'Δημιουργία λογαριασμού':'Καλώς ήρθατε'}</h1><p>{activate?'Συμπληρώστε το όνομά σας για να ξεκινήσετε. Ο χώρος σας ξεκινά άδειος. Δημιουργείτε εσείς τους ασθενείς, τις επισκέψεις και τα ραντεβού σας.':'Ένας ήρεμος χώρος για την κλινική σας εργασία. Για την πιλοτική δοκιμή χρησιμοποιήστε ψευδή ονόματα και στοιχεία.'}</p>{!activate&&google&&<button disabled={busy} onClick={()=>void googleLogin()}>Συνέχεια με Google</button>}<form onSubmit={submit}><fieldset disabled={busy}>
 {activate?<><label>Ονοματεπώνυμο<input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label></>:<><label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Κωδικός πρόσβασης<input type="password" required minLength={signup?12:1} maxLength={128} autoComplete={signup?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>{signup&&<small>Τουλάχιστον 12 χαρακτήρες. Το email επιβεβαιώνεται πριν από την πρώτη χρήση.</small>}</>}
 <button className="pilot-primary" type="submit">{busy?'Παρακαλώ περιμένετε…':activate?'Έναρξη':signup?'Δημιουργία λογαριασμού':'Σύνδεση'}</button></fieldset></form>
 {!activate&&!signup&&<Link href="/forgot-password">Ξέχασα τον κωδικό;</Link>}
 {error&&<p role="alert" className="pilot-error">{error}</p>}{message&&<p role="status">{message}</p>}
 {!activate&&<button className="pilot-text-button" onClick={()=>{setSignup(!signup);setError('');setMessage('')}}>{signup?'Έχω ήδη λογαριασμό':'Δημιουργία λογαριασμού'}</button>}
 {activate&&<Link href="/account">Λογαριασμός / αποσύνδεση</Link>}
 </section></main>;
}
