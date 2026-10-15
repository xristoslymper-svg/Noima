'use client';
import {useTranslations} from 'next-intl';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, UserRound } from 'lucide-react';
import { getDemoTesterId } from '@/lib/demo-tester';

export default function NewPatient(){
 const t=useTranslations();

 const router=useRouter(); const savingRef=useRef(false); const [firstName,setFirstName]=useState(''); const [lastName,setLastName]=useState(''); const [age,setAge]=useState(''); const [phone,setPhone]=useState(''); const [landline,setLandline]=useState(''); const [contactPhone,setContactPhone]=useState(''); const [amka,setAmka]=useState(''); const [address,setAddress]=useState(''); const [email,setEmail]=useState(''); const [complaint,setComplaint]=useState(''); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
 async function submit(){
  if(savingRef.current)return;
  if(!firstName.trim()){setError(t('validation.firstNameRequired'));return} savingRef.current=true;setSaving(true);setError('');
  try{const response=await fetch('/api/patients/demo/runtime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create_patient',tester:getDemoTesterId(),first_name:firstName,last_name:lastName,age,phone,landline,contact_phone:contactPhone,amka,address,email,chief_complaint:complaint})});const data=await response.json();if(!response.ok)throw new Error(data.error);router.push(`/patients/demo/${data.patient.id}?new=1`)}catch(cause){setError(cause instanceof Error?cause.message:t('errors.patientCreate'))}finally{savingRef.current=false;setSaving(false)}
 }
 return <main className="intake-page"><div className="intake-top"><Link href="/patients" className="back"><ArrowLeft size={17}/>  {t('navigation.patients')}</Link><span>{t('patients.newDemoPatient')}</span></div><section className="intake-wrap compact-intake">
  <div className="intake-heading"><div><span className="new-patient-chip">FICTIONAL TEST DATA</span><h1>{t('patients.createRecord')}</h1><p>{t('patients.newDescription')}</p></div></div>
  <section className="intake-card demographics"><div className="intake-card-title"><span className="intake-icon"><UserRound size={18}/></span><div><h2>{t('patients.basicDetails')}</h2><p>{t('patients.nameRequiredHelp')}</p></div></div>
   <div className="patient-create-grid"><label>{t('patients.firstNameRequired')}<input autoFocus value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder={t('patients.firstNameExample')}/></label><label>{t('patients.lastName')}<input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder={t('patients.lastNameExample')}/></label><label>{t('patients.age')}<input value={age} onChange={e=>setAge(e.target.value.replace(/\D/g,'').slice(0,3))} inputMode="numeric" placeholder="—"/></label><label>{t('patients.mobile')}<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder={t('common.optional')}/></label><label>{t('patients.landline')}<input value={landline} onChange={e=>setLandline(e.target.value)} placeholder={t('common.optional')}/></label><label>{t('patients.additionalPhone')}<input value={contactPhone} onChange={e=>setContactPhone(e.target.value)} placeholder={t('common.optional')}/></label><label>{t('patients.amka')}<input value={amka} onChange={e=>setAmka(e.target.value.replace(/\D/g,'').slice(0,11))} inputMode="numeric" placeholder={t('patients.amkaDigits')}/></label><label>{t('patients.address')}<input value={address} onChange={e=>setAddress(e.target.value)} placeholder={t('patients.addressPlaceholder')}/></label><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={t('common.optional')}/></label></div>
   <label className="create-complaint">{t('clinical.presentingComplaint')}<textarea rows={4} value={complaint} onChange={e=>setComplaint(e.target.value)} placeholder={t('clinical.presentingComplaintHelp')}/></label>
  </section>
  {error&&<div className="record-state error" role="alert">{error}</div>}
  <div className="intake-footer"><span>{t('patients.syntheticDataNotice')}</span><button className="save-intake" onClick={()=>void submit()} disabled={saving}>{saving?t('common.creating'):t('patients.createRecord')} <ChevronRight size={17}/></button></div>
 </section></main>
}
