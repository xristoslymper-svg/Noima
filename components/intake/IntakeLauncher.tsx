'use client';
import {useSystemMessage} from '@/i18n/system-message';

import {useTranslations} from 'next-intl';

import {useLocale} from 'next-intl';

import {isLocale,languageNames,locales,type Locale} from '@/i18n/config';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {Check,Mail,Printer,Tablet,UserRound,X} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import {useAccountSession} from '@/components/AccountSessionBoundary';

type Device={id:string;label:string;active:boolean};
type Patient={id:string;first_name:string;last_name:string;email?:string};
type Event={id:string;patient_id:string|null;patient_name:string;scheduled_start:string;status:string;provisional_email?:string};
type Channel='tablet'|'email'|'print';


export default function IntakeLauncher({
 patientId,
 appointmentId,
 patientEmail='',
 subjectLabel='',
 defaultTools=['history'],
 initialChannel='email',
 lockTools=false,
 onClose,
 onDone
}:{
 patientId?:string;
 appointmentId?:string;
 patientEmail?:string;
 subjectLabel?:string;
 defaultTools?:string[];
 initialChannel?:Channel;
 lockTools?:boolean;
 onClose:()=>void;
 onDone?:()=>void;
}){
 const systemMessage=useSystemMessage();

 const t=useTranslations();
 const toolLabel=(tool:string)=>tool==='history'?t('history.initialHistory'):tool;

 const locale=useLocale();

 const account=useAccountSession();
 const [recipientLocale,setRecipientLocale]=useState<Locale>('el');
 const [tools,setTools]=useState<string[]>(defaultTools);
 const [channel,setChannel]=useState<Channel>(initialChannel);
 const [devices,setDevices]=useState<Device[]>([]);
 const [deviceId,setDeviceId]=useState('');
 const [patients,setPatients]=useState<Patient[]>([]);
 const [events,setEvents]=useState<Event[]>([]);
 const [subjectMode,setSubjectMode]=useState<'appointment'|'patient'|'new'>('appointment');
 const [subject,setSubject]=useState(patientId?'patient:'+patientId:appointmentId?'appointment:'+appointmentId:'');
 const [newPatient,setNewPatient]=useState({first_name:'',last_name:''});
 const [email,setEmail]=useState(patientEmail);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [done,setDone]=useState('');
 const fixed=Boolean(patientId||appointmentId);

 useEffect(()=>{
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)onClose()};
  document.addEventListener('keydown',onKeyDown);
  return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',onKeyDown)};
 },[busy,onClose]);

 useEffect(()=>{
  let live=true;
  void (async()=>{
   const tester=getDemoTesterId();
   const reqs=[fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'devices',tester})})];
   if(!fixed){
    reqs.push(fetch('/api/patients/demo/runtime?tester='+encodeURIComponent(tester),{cache:'no-store'}));
    reqs.push(fetch('/api/overview?tester='+encodeURIComponent(tester),{cache:'no-store'}));
   }
   const all=await Promise.all(reqs);
   const d=await Promise.all(all.map(r=>r.json()));
   if(!live)return;
   const ds=(d[0].devices||[]).filter((x:Device)=>x.active) as Device[];
   setDevices(ds);
   if(ds[0])setDeviceId(ds[0].id);
   if(!fixed){
    setPatients(d[1].patients||[]);
    setEvents((d[2].events||[]).filter((e:Event)=>e.status==='scheduled'));
   }
  })().catch(()=>{if(live)setError(t('errors.deliveryOptionsLoad'))});
  return()=>{live=false};
 },[fixed]);

 const selected=useMemo(()=>{
  if(fixed)return {
   patient_id:patientId||null,
   appointment_id:appointmentId||null,
   email:patientEmail,
   label:subjectLabel||t('patients.selectedPatient'),
   hint:appointmentId&&!patientId?t('history.newPatientAfterSubmission'):appointmentId?t('history.linkedToAppointment'):t('history.existingRecordDestination')
  };
  if(subjectMode==='patient'&&subject.startsWith('patient:')){
   const p=patients.find(x=>x.id===subject.slice(8));
   return {patient_id:subject.slice(8),appointment_id:null,email:p?.email||'',label:p?[p.first_name,p.last_name].filter(Boolean).join(' '):t('patients.selectedPatient'),hint:t('history.existingRecordDestination')};
  }
  if(subjectMode==='appointment'&&subject.startsWith('appointment:')){
   const e=events.find(x=>x.id===subject.slice(12));
   return {patient_id:e?.patient_id||null,appointment_id:subject.slice(12),email:e?.provisional_email||'',label:e?.patient_name||t('calendar.selectedAppointment'),hint:e?.patient_id?t('history.linkedToAppointment'):t('history.newPatientAfterSubmission')};
  }
  if(subjectMode==='new'){
   const label=[newPatient.first_name,newPatient.last_name].map(x=>x.trim()).filter(Boolean).join(' ')||t('patients.newPatient');
   return {patient_id:null,appointment_id:null,email:'',label,hint:t('history.noRecordUntilSubmission')};
  }
  return {patient_id:null,appointment_id:null,email:'',label:'',hint:''};
 },[fixed,subjectMode,subject,newPatient,patients,events,patientId,appointmentId,patientEmail,subjectLabel]);

 useEffect(()=>{if(!email&&selected.email)setEmail(selected.email)},[selected.email,email]);

 function toggle(tool:string){
  if(lockTools)return;
  setTools(v=>v.includes(tool)?v.filter(x=>x!==tool):[...v,tool]);
 }

 async function send(){
  if(!tools.length){setError(t('validation.selectInstrument'));return}
  const isNew=!fixed&&subjectMode==='new';
  if(isNew&&!newPatient.first_name.trim()){setError(t('validation.newPatientName'));return}
  if(!isNew&&!selected.patient_id&&!selected.appointment_id){setError(t('validation.patientOrAppointment'));return}
  if(channel==='tablet'&&!deviceId){setError(t('errors.tabletNotConnected'));return}
  if(channel==='email'&&!email.trim()){setError(t('validation.recipientEmailRequired'));return}
  setBusy(true);setError('');
  const printWindow=channel==='print'?window.open('about:blank','_blank'):null;
  try{
   const provisional_identity=isNew?{first_name:newPatient.first_name.trim(),last_name:newPatient.last_name.trim(),email:email.trim()}:null;
   const r=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'assign',tester:getDemoTesterId(),patient_id:selected.patient_id,appointment_id:selected.appointment_id,provisional_identity,tools,channel,recipient_locale:recipientLocale,device_id:channel==='tablet'?deviceId:null})});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||t('errors.assignmentCreate'));
   if(channel==='print'){
    if(printWindow)printWindow.location.href=d.printLink;else window.open(d.printLink,'_blank');
    setDone(t('history.printCreatedForPrefix')+selected.label+'.');
    onDone?.();
    return;
   }
   if(channel==='email'){
    const mail=await fetch('/api/intake/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intake_id:d.intake.id,token:d.intakeToken,to:email.trim(),tools,recipient_locale:recipientLocale,doctor_name:account?.identity?.full_name||''})});
    const md=await mail.json();
    if(!mail.ok){
     if(md.code==='connect'&&md.fallback?.subject&&md.fallback?.body){
      window.location.href='mailto:'+encodeURIComponent(email.trim())+'?'+new URLSearchParams({subject:String(md.fallback.subject),body:String(md.fallback.body)}).toString().replaceAll('+','%20');
      setDone(t('history.mailboxOpenedForPrefix')+selected.label+'.');
      onDone?.();
      return;
     }
     throw new Error(md.error||t('errors.emailNotSent'));
    }
    setDone(t('history.personalLinkSentPrefix')+selected.label+'. '+(!selected.patient_id?t('history.recordCreatedOnSubmit'):t('history.answersReturnAutomatically')));
    onDone?.();
    return;
   }
   setDone(t('history.assignmentForPrefix')+selected.label+t('history.sentToSuffix')+(devices.find(x=>x.id===deviceId)?.label||'tablet')+'.');
   onDone?.();
  }catch(e){
   printWindow?.close();
   setError(e instanceof Error?e.message:t('errors.assignmentIncomplete'));
  }finally{setBusy(false)}
 }

 return <div className="intake-launcher-backdrop" onClick={()=>!busy&&onClose()}>
  <section className="intake-launcher assignment-launcher" role="dialog" aria-modal="true" aria-labelledby="assignment-title" onClick={e=>e.stopPropagation()}>
   <button className="intake-launcher-close" onClick={onClose} disabled={busy} aria-label={t('common.close')}><X size={18}/></button>
   <span className="kicker">{t('history.assignmentKicker')}</span>
   <h2 id="assignment-title">{t('psychometrics.patientCompletion')}</h2>
   <div className="assignment-language"><label>{t('documents.recipientLanguage')}<select disabled={busy||channel==='tablet'} value={recipientLocale} onChange={e=>{if(isLocale(e.target.value))setRecipientLocale(e.target.value)}}>{locales.map(code=><option key={code} value={code}>{languageNames[code]}</option>)}</select></label><small>{channel==='tablet'?t('documents.tabletLanguageHelp'):t('documents.recipientLanguageHelp')}</small>{tools.some(tool=>tool!=='history')&&<small>{t('psychometrics.originalInstrumentLanguage')}</small>}</div><p className="assignment-intro">{t('history.assignmentHelp')}</p>

   <div className="assignment-step">
    <div className="assignment-step-title"><span>1</span><div><strong>{t('psychometrics.instrument')}</strong><small>{lockTools?t('psychometrics.selectedFromLibrary'):t('history.choosePatientTools')}</small></div></div>
    {lockTools
      ?<div className="assignment-tool-summary">{tools.map(tool=><span key={tool}>{toolLabel(tool)}</span>)}</div>
      :<div className="intake-tool-picker assignment-tool-picker">
        <label><input type="checkbox" checked={tools.includes('history')} onChange={()=>toggle('history')}/><span>{t('history.initialHistory')}</span></label>
        <label><input type="checkbox" checked={tools.includes('PHQ-9')} onChange={()=>toggle('PHQ-9')}/><span>PHQ-9</span></label>
        <label><input type="checkbox" checked={tools.includes('GAD-7')} onChange={()=>toggle('GAD-7')}/><span>GAD-7</span></label>
       </div>}
   </div>

   <div className="assignment-step">
    <div className="assignment-step-title"><span>2</span><div><strong>{t('history.recipient')}</strong><small>{fixed?t('history.linkAlreadySet'):t('history.recipientOptionsHelp')}</small></div></div>
    {!fixed
      ?<>
        <div className="assignment-subject-modes">
         <button type="button" className={subjectMode==='appointment'?'selected':''} onClick={()=>{setSubjectMode('appointment');setSubject('');setEmail('')}}>{t('calendar.appointment')}</button>
         <button type="button" className={subjectMode==='patient'?'selected':''} onClick={()=>{setSubjectMode('patient');setSubject('');setEmail('')}}>{t('patients.existingPatient')}</button>
         <button type="button" className={subjectMode==='new'?'selected':''} onClick={()=>{setSubjectMode('new');setSubject('');setEmail('')}}>{t('patients.newPatient')}</button>
        </div>
        {subjectMode==='appointment'&&<label className="assignment-subject-select"><select value={subject} onChange={e=>{setSubject(e.target.value);setEmail('')}}>
         <option value="">{t('calendar.selectAppointmentPlaceholder')}</option>
         {events.map(e=><option key={e.id} value={'appointment:'+e.id}>{e.patient_name} · {new Intl.DateTimeFormat(locale,{timeZone:'Europe/Athens',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(e.scheduled_start))}{e.patient_id?'':t('patients.noRecordSuffix')}</option>)}
        </select></label>}
        {subjectMode==='patient'&&<label className="assignment-subject-select"><select value={subject} onChange={e=>{setSubject(e.target.value);setEmail('')}}>
         <option value="">{t('patients.selectPatientPlaceholder')}</option>
         {patients.map(p=><option key={p.id} value={'patient:'+p.id}>{p.first_name} {p.last_name}</option>)}
        </select></label>}
        {subjectMode==='new'&&<div className="assignment-new-patient">
         <label>{t('patients.firstName')}<input value={newPatient.first_name} onChange={e=>setNewPatient(v=>({...v,first_name:e.target.value}))} placeholder={t('patients.firstName')}/></label>
         <label>{t('patients.lastName')} <span>{t('common.optionalLower')}</span><input value={newPatient.last_name} onChange={e=>setNewPatient(v=>({...v,last_name:e.target.value}))} placeholder={t('patients.lastName')}/></label>
         <p>{t('history.identityBeforeCreateHelp')}</p>
        </div>}
       </>
      :<div className="assignment-subject-summary"><UserRound size={17}/><div><strong>{selected.label}</strong><span>{selected.hint}</span></div><Check size={16}/></div>}
    {!fixed&&((subjectMode==='new'&&newPatient.first_name.trim())||subject)&&<div className="assignment-subject-confirm"><UserRound size={16}/><div><strong>{selected.label}</strong><span>{selected.hint}</span></div></div>}
   </div>

   <div className="assignment-step">
    <div className="assignment-step-title"><span>3</span><div><strong>{t('history.completionMethod')}</strong><small>{t('history.sameAssignmentHelp')}</small></div></div>
    <div className="intake-channel-picker">
     <button className={channel==='tablet'?'selected':''} onClick={()=>setChannel('tablet')}><Tablet size={18}/> Tablet</button>
     <button className={channel==='email'?'selected':''} onClick={()=>setChannel('email')}><Mail size={18}/> Email</button>
     <button className={channel==='print'?'selected':''} onClick={()=>setChannel('print')}><Printer size={18}/>  {t('documents.print')}</button>
    </div>
    {channel==='tablet'&&<div className="intake-channel-detail">{devices.length?<label>{t('history.device')}<select value={deviceId} onChange={e=>setDeviceId(e.target.value)}>{devices.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label>:<p>{t('history.noTabletConnected')} <Link href="/tablet" target="_blank">{t('history.openTabletMode')}</Link></p>}</div>}
    {channel==='email'&&<div className="assignment-email-wrap"><label className="assignment-email">{t('notifications.recipientEmail')}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="patient@example.com"/></label><p>{t('history.emailCompletionHelp')}</p></div>}
    {channel==='print'&&<div className="intake-channel-detail"><p>{t('history.printCompletionHelp')}</p></div>}
   </div>

   {done&&<div className="intake-launcher-success"><Check size={16}/>{done}</div>}
   {error&&<p className="intake-error" role="alert">{systemMessage(error)}</p>}
   <footer>
    <button onClick={onClose} disabled={busy}>{t('common.close')}</button>
    <button className="intake-primary" disabled={busy||Boolean(done)} onClick={()=>void send()}>{busy?t('common.preparing'):channel==='tablet'?t('history.sendToTablet'):channel==='email'?t('notifications.sendEmail'):t('documents.openForPrint')}</button>
   </footer>
  </section>
 </div>;
}
