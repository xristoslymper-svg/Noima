'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, UserRound } from 'lucide-react';
import {isClinicalId} from '@/lib/clinical/identity';
import { getDemoTesterId } from '@/lib/demo-tester';

import {emptyPatientForm,recoverPatientForm,persistPatientForm,clearPatientForm,possiblePatientMatches,patientIdentityHint,type PatientForm,type PatientIdentity} from '@/lib/patients/patient-entry';

export default function NewPatient(){
 const router=useRouter();const savingRef=useRef(false);const ownerRef=useRef('');const formRef=useRef<PatientForm>({...emptyPatientForm});
 const [form,setForm]=useState<PatientForm>({...emptyPatientForm});const [ready,setReady]=useState(false);const [recovered,setRecovered]=useState(false);const [recoveryError,setRecoveryError]=useState('');const [patients,setPatients]=useState<PatientIdentity[]>([]);const [lookupError,setLookupError]=useState(false);const [lookupPending,setLookupPending]=useState(true);const [reviewDuplicates,setReviewDuplicates]=useState(false);
 const [saving,setSaving]=useState(false);const [error,setError]=useState('');
 const {firstName,lastName,age,phone,landline,contactPhone,amka,address,email,complaint}=form;
 useEffect(()=>{
  const owner=getDemoTesterId();ownerRef.current=owner;
  try{const saved=recoverPatientForm(sessionStorage,owner);if(saved){formRef.current=saved;setForm(saved);setRecovered(true)}}catch{setRecoveryError('Η ανάκτηση σε αυτή την καρτέλα δεν είναι διαθέσιμη.')}
  if(!owner)setRecoveryError('Δεν αναγνωρίστηκε ο χώρος εργασίας. Συνδεθείτε ξανά πριν συμπληρώσετε στοιχεία.');
  setReady(true);
  const controller=new AbortController();
  void fetch('/api/patients/demo/runtime?tester='+encodeURIComponent(owner),{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok||!Array.isArray(data.patients))throw new Error('lookup');setPatients(data.patients)}).catch(()=>{if(!controller.signal.aborted)setLookupError(true)}).finally(()=>{if(!controller.signal.aborted)setLookupPending(false)});
  const guard=(event:BeforeUnloadEvent)=>{if(Object.values(formRef.current).some(Boolean)&&!savingRef.current){event.preventDefault();event.returnValue=''}};
  window.addEventListener('beforeunload',guard);
  return()=>{controller.abort();window.removeEventListener('beforeunload',guard)};
 },[]);
 function change(key:keyof PatientForm,value:string){
  if(!ready)return;if(getDemoTesterId()!==ownerRef.current){setRecoveryError('Ο λογαριασμός άλλαξε. Ανανεώστε τη σελίδα πριν συνεχίσετε.');return}const next={...formRef.current,[key]:value};formRef.current=next;setForm(next);setReviewDuplicates(false);
  try{persistPatientForm(sessionStorage,ownerRef.current,next);setRecoveryError('')}catch{setRecoveryError('Το προσχέδιο δεν αποθηκεύτηκε σε αυτή την καρτέλα. Μην κλείσετε πριν δημιουργήσετε τον φάκελο.')}
 }
 function discard(){try{clearPatientForm(sessionStorage,ownerRef.current)}catch{setRecoveryError('Δεν καθαρίστηκε το προσχέδιο.');return}formRef.current={...emptyPatientForm};setForm({...emptyPatientForm});setRecovered(false);setReviewDuplicates(false);setError('')}
 const matches=possiblePatientMatches(patients,form);
 async function submit(confirmed=false){
  if(savingRef.current||!ready||lookupPending)return;
  if(!ownerRef.current||getDemoTesterId()!==ownerRef.current){setError('Ο λογαριασμός άλλαξε. Ανανεώστε τη σελίδα πριν συνεχίσετε.');return}
  if(matches.length&&!confirmed){setReviewDuplicates(true);return}
  if(!firstName.trim()){setError('Συμπληρώστε τουλάχιστον το όνομα.');return} savingRef.current=true;setSaving(true);setError('');
  try{const response=await fetch('/api/patients/demo/runtime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create_patient',tester:getDemoTesterId(),first_name:firstName,last_name:lastName,age,phone,landline,contact_phone:contactPhone,amka,address,email,chief_complaint:complaint})});const data=await response.json();if(!response.ok)throw new Error(data.error);if(!isClinicalId(data.patient?.id))throw new Error('Δεν επιβεβαιώθηκε η δημιουργία φακέλου. Το προσχέδιο διατηρήθηκε.');try{clearPatientForm(sessionStorage,ownerRef.current)}catch{};formRef.current={...emptyPatientForm};router.push(`/patients/demo/${data.patient.id}?new=1`)}catch(cause){setError(cause instanceof Error?cause.message:'Δεν δημιουργήθηκε η καρτέλα.')}finally{savingRef.current=false;setSaving(false)}
 }
 return <main className="intake-page"><div className="intake-top"><Link href="/patients" className="back"><ArrowLeft size={17}/> Ασθενείς</Link><span>Νέος δοκιμαστικός ασθενής</span></div><section className="intake-wrap compact-intake">
  <div className="intake-heading"><div><span className="new-patient-chip">FICTIONAL TEST DATA</span><h1>Δημιουργία φακέλου</h1><p>Μόνο τα βασικά. Η κλινική αξιολόγηση γίνεται μέσα στον ίδιο φάκελο.</p></div></div>
  {(recovered||Object.values(form).some(Boolean))&&<div className="record-state saved-draft" role="status">{recovered?'Ανακτήθηκε η μη υποβλημένη εγγραφή.':'Το προσχέδιο διατηρείται σε αυτή την καρτέλα.'} Δεν έχει δημιουργηθεί φάκελος. <button type="button" onClick={discard} disabled={saving}>Καθαρισμός προσχεδίου</button></div>}
  {recoveryError&&<p className="record-state error" role="alert">{recoveryError}</p>}
  <fieldset disabled={!ready||saving} style={{border:0,padding:0,margin:0,minWidth:0}}><section className="intake-card demographics"><div className="intake-card-title"><span className="intake-icon"><UserRound size={18}/></span><div><h2>Βασικά στοιχεία</h2><p>Το όνομα είναι το μόνο υποχρεωτικό πεδίο στο demo.</p></div></div>
   <div className="patient-create-grid"><label>Όνομα *<input autoFocus value={firstName} onChange={e=>change('firstName',e.target.value)} placeholder="π.χ. Νίκος"/></label><label>Επώνυμο<input value={lastName} onChange={e=>change('lastName',e.target.value)} placeholder="π.χ. Δ."/></label><label>Ηλικία<input value={age} onChange={e=>change('age',e.target.value.replace(/\D/g,'').slice(0,3))} inputMode="numeric" placeholder="—"/></label><label>Κινητό<input value={phone} onChange={e=>change('phone',e.target.value)} placeholder="Προαιρετικό"/></label><label>Σταθερό<input value={landline} onChange={e=>change('landline',e.target.value)} placeholder="Προαιρετικό"/></label><label>Επιπλέον τηλ. επικοινωνίας<input value={contactPhone} onChange={e=>change('contactPhone',e.target.value)} placeholder="Προαιρετικό"/></label><label>ΑΜΚΑ<input value={amka} onChange={e=>change('amka',e.target.value.replace(/\D/g,'').slice(0,11))} inputMode="numeric" placeholder="11 ψηφία"/></label><label>Διεύθυνση<input value={address} onChange={e=>change('address',e.target.value)} placeholder="Οδός, αριθμός, περιοχή"/></label><label>Email<input type="email" value={email} onChange={e=>change('email',e.target.value)} placeholder="Προαιρετικό"/></label></div>
   <label className="create-complaint">Λόγος προσέλευσης<textarea rows={4} value={complaint} onChange={e=>change('complaint',e.target.value)} placeholder="Μία σύντομη φράση αρκεί. Η αναλυτική λήψη ιστορικού γίνεται στην αρχική αξιολόγηση."/></label>
  </section>
  </fieldset>
  {lookupError&&<p className="record-state" role="status">Δεν φορτώθηκε ο έλεγχος υπαρχόντων ασθενών. Ελέγξτε το μητρώο πριν δημιουργήσετε νέο φάκελο.</p>}
  {matches.length>0&&<section className="intake-card" aria-label="Πιθανές υπάρχουσες καρτέλες"><h2>Υπάρχει ήδη φάκελος;</h2><p>Ελέγξτε τα στοιχεία πριν δημιουργήσετε δεύτερη καρτέλα. Η αντιστοίχιση δεν γίνεται αυτόματα.</p>{matches.map(p=><p key={p.id}><Link href={'/patients/demo/'+p.id}>{p.first_name} {p.last_name} · Α/Α {p.registry_number||'—'}</Link><br/><small>{patientIdentityHint(p)}</small></p>)}{reviewDuplicates&&<div role="alert"><p>Αν πρόκειται για διαφορετικό ασθενή, μπορείτε να συνεχίσετε με ξεχωριστό φάκελο.</p><button type="button" className="save-intake" disabled={saving} onClick={()=>void submit(true)}>Είναι διαφορετικός ασθενής — δημιουργία</button></div>}</section>}
  {error&&<div className="record-state error" role="alert">{error}</div>}
  <div className="intake-footer"><span>Demo MVP · χρησιμοποιήστε μόνο φανταστικά στοιχεία.</span><button className="save-intake" onClick={()=>void submit()} disabled={saving||!ready||lookupPending}>{saving?'Δημιουργία…':'Δημιουργία φακέλου'} <ChevronRight size={17}/></button></div>
 </section></main>
}
