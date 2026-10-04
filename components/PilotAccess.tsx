'use client';
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
export default function PilotAccess({activate=false}:{activate?:boolean}){
 const [signup,setSignup]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{
  const r=await fetch('/api/pilot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(activate?{action:'redeem',name,code}:{action:signup?'signup':'login',email,password})});const d=await r.json();if(!r.ok)throw new Error(d.error);
  if(d.confirmation_required){setMessage('Επιβεβαιώστε το email από το μήνυμα που λάβατε και συνδεθείτε εδώ. Μετά θα ενεργοποιήσετε την πρόσκλησή σας.');setSignup(false);setPassword('');}else window.location.assign(activate?'/':'/pilot');
 }catch(e){setError(e instanceof Error?e.message:'Δεν ολοκληρώθηκε.')}finally{setBusy(false)}}
 return <main className="pilot-page"><section className="pilot-card"><div className="brand-mark">Ψ</div><span className="kicker">NOIMA · ΠΙΛΟΤΙΚΗ ΔΟΚΙΜΗ</span><h1>{activate?'Ο προσωπικός σας χώρος':signup?'Δημιουργία λογαριασμού':'Καλώς ήρθατε'}</h1><p>{activate?'Ενεργοποιήστε την πρόσκληση που σας δόθηκε. Ο χώρος σας ξεκινά άδειος. Δημιουργείτε εσείς τους ασθενείς, τις επισκέψεις και τα ραντεβού σας.':'Ένας ήρεμος χώρος για την κλινική σας εργασία. Για την πιλοτική δοκιμή χρησιμοποιήστε ψευδή ονόματα και στοιχεία.'}</p><form onSubmit={submit}><fieldset disabled={busy}>
 {activate?<><label>Ονοματεπώνυμο<input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label><label>Κωδικός πρόσκλησης<input required autoComplete="off" value={code} onChange={e=>setCode(e.target.value)} maxLength={128}/></label></>:<><label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Κωδικός πρόσβασης<input type="password" required minLength={signup?12:1} maxLength={128} autoComplete={signup?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>{signup&&<small>Τουλάχιστον 12 χαρακτήρες. Η πρόσβαση στον χώρο απαιτεί πρόσκληση.</small>}</>}
 <button className="pilot-primary" type="submit">{busy?'Παρακαλώ περιμένετε…':activate?'Ενεργοποίηση χώρου':signup?'Δημιουργία λογαριασμού':'Σύνδεση'}</button></fieldset></form>
 {error&&<p role="alert" className="pilot-error">{error}</p>}{message&&<p role="status">{message}</p>}
 {!activate&&<button className="pilot-text-button" onClick={()=>{setSignup(!signup);setError('');setMessage('')}}>{signup?'Έχω ήδη λογαριασμό':'Έχω πρόσκληση · δημιουργία λογαριασμού'}</button>}
 {activate&&<Link href="/account">Λογαριασμός / αποσύνδεση</Link>}
 </section></main>;
}
