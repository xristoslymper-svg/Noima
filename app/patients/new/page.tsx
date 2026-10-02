'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ChevronRight, UserRound } from 'lucide-react';
import { getDemoTesterId } from '@/lib/demo-tester';

export default function NewPatient(){
 const router=useRouter(); const [firstName,setFirstName]=useState(''); const [lastName,setLastName]=useState(''); const [age,setAge]=useState(''); const [phone,setPhone]=useState(''); const [email,setEmail]=useState(''); const [complaint,setComplaint]=useState(''); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
 async function submit(){
  if(!firstName.trim()){setError('Συμπληρώστε τουλάχιστον το όνομα.');return} setSaving(true);setError('');
  try{const response=await fetch('/api/patients/demo/runtime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create_patient',tester:getDemoTesterId(),first_name:firstName,last_name:lastName,age,phone,email,chief_complaint:complaint})});const data=await response.json();if(!response.ok)throw new Error(data.error);router.push(`/patients/demo/${data.patient.id}?new=1`)}catch(cause){setError(cause instanceof Error?cause.message:'Δεν δημιουργήθηκε η καρτέλα.')}finally{setSaving(false)}
 }
 return <main className="intake-page"><div className="intake-top"><Link href="/patients" className="back"><ArrowLeft size={17}/> Ασθενείς</Link><span>Νέος δοκιμαστικός ασθενής</span></div><section className="intake-wrap compact-intake">
  <div className="intake-heading"><div><span className="new-patient-chip">FICTIONAL TEST DATA</span><h1>Δημιουργία φακέλου</h1><p>Μόνο τα βασικά. Η κλινική αξιολόγηση γίνεται μέσα στον ίδιο φάκελο.</p></div></div>
  <section className="intake-card demographics"><div className="intake-card-title"><span className="intake-icon"><UserRound size={18}/></span><div><h2>Βασικά στοιχεία</h2><p>Το όνομα είναι το μόνο υποχρεωτικό πεδίο στο demo.</p></div></div>
   <div className="patient-create-grid"><label>Όνομα *<input autoFocus value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="π.χ. Νίκος"/></label><label>Επώνυμο<input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="π.χ. Δ."/></label><label>Ηλικία<input value={age} onChange={e=>setAge(e.target.value.replace(/\D/g,'').slice(0,3))} inputMode="numeric" placeholder="—"/></label><label>Τηλέφωνο<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Προαιρετικό"/></label><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Προαιρετικό"/></label></div>
   <label className="create-complaint">Λόγος προσέλευσης<textarea rows={4} value={complaint} onChange={e=>setComplaint(e.target.value)} placeholder="Μία σύντομη φράση αρκεί. Η αναλυτική λήψη ιστορικού γίνεται στην αρχική αξιολόγηση."/></label>
  </section>
  {error&&<div className="record-state error" role="alert">{error}</div>}
  <div className="intake-footer"><span>Demo MVP · χρησιμοποιήστε μόνο φανταστικά στοιχεία.</span><button className="save-intake" onClick={()=>void submit()} disabled={saving}>{saving?'Δημιουργία…':'Δημιουργία φακέλου'} <ChevronRight size={17}/></button></div>
 </section></main>
}
