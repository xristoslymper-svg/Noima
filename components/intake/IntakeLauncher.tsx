'use client';
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useOverlayDismiss} from '@/components/useOverlayDismiss';
import {Check,Mail,Printer,Tablet,UserRound,X} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import {useAccountSession} from '@/components/AccountSessionBoundary';

type Device={id:string;label:string;active:boolean};
type Patient={id:string;first_name:string;last_name:string;email?:string};
type Event={id:string;patient_id:string|null;patient_name:string;scheduled_start:string;status:string;provisional_email?:string};
type Channel='tablet'|'email'|'print';

const toolLabel=(tool:string)=>tool==='history'?'Αρχικό ιστορικό':tool;
export default function IntakeLauncher({
 patientId,
 appointmentId,
 patientEmail='',
 subjectLabel='',
 defaultTools=['history'],
 initialChannel='tablet',
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
 const account=useAccountSession();
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

 useOverlayDismiss(onClose,{busy});
 const inFlight=useRef(false);

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
  })().catch(()=>{if(live)setError('Δεν φορτώθηκαν οι επιλογές αποστολής.')});
  return()=>{live=false};
 },[fixed]);

 const selected=useMemo(()=>{
  if(fixed)return {
   patient_id:patientId||null,
   appointment_id:appointmentId||null,
   email:patientEmail,
   label:subjectLabel||'Επιλεγμένος ασθενής',
   hint:appointmentId&&!patientId?'Νέος ασθενής · ο φάκελος θα δημιουργηθεί μετά την υποβολή.':appointmentId?'Συνδεδεμένο με το συγκεκριμένο ραντεβού.':'Θα καταχωριστεί στον υπάρχοντα φάκελο.'
  };
  if(subjectMode==='patient'&&subject.startsWith('patient:')){
   const p=patients.find(x=>x.id===subject.slice(8));
   return {patient_id:subject.slice(8),appointment_id:null,email:p?.email||'',label:p?[p.first_name,p.last_name].filter(Boolean).join(' '):'Επιλεγμένος ασθενής',hint:'Θα καταχωριστεί στον υπάρχοντα φάκελο.'};
  }
  if(subjectMode==='appointment'&&subject.startsWith('appointment:')){
   const e=events.find(x=>x.id===subject.slice(12));
   return {patient_id:e?.patient_id||null,appointment_id:subject.slice(12),email:e?.provisional_email||'',label:e?.patient_name||'Επιλεγμένο ραντεβού',hint:e?.patient_id?'Συνδεδεμένο με το συγκεκριμένο ραντεβού.':'Νέος ασθενής · ο φάκελος θα δημιουργηθεί μετά την υποβολή.'};
  }
  if(subjectMode==='new'){
   const label=[newPatient.first_name,newPatient.last_name].map(x=>x.trim()).filter(Boolean).join(' ')||'Νέος ασθενής';
   return {patient_id:null,appointment_id:null,email:'',label,hint:'Δεν δημιουργείται φάκελος τώρα. Θα δημιουργηθεί αυτόματα μόνο αφού ολοκληρωθεί η υποβολή.'};
  }
  return {patient_id:null,appointment_id:null,email:'',label:'',hint:''};
 },[fixed,subjectMode,subject,newPatient,patients,events,patientId,appointmentId,patientEmail,subjectLabel]);

 useEffect(()=>{if(!email&&selected.email)setEmail(selected.email)},[selected.email,email]);

 function toggle(tool:string){
  if(lockTools)return;
  setTools(v=>v.includes(tool)?v.filter(x=>x!==tool):[...v,tool]);
 }

 async function send(){
  if(inFlight.current)return;
  if(!tools.length){setError('Επιλέξτε τουλάχιστον ένα εργαλείο.');return}
  const isNew=!fixed&&subjectMode==='new';
  if(isNew&&!newPatient.first_name.trim()){setError('Συμπληρώστε το όνομα του νέου ασθενή.');return}
  if(!isNew&&!selected.patient_id&&!selected.appointment_id){setError('Επιλέξτε ασθενή ή ραντεβού.');return}
  if(channel==='tablet'&&!deviceId){setError('Δεν υπάρχει συνδεδεμένο tablet. Ανοίξτε πρώτα το Noima Tablet στη συσκευή.');return}
  if(channel==='email'&&!email.trim()){setError('Συμπληρώστε email παραλήπτη.');return}
  inFlight.current=true;setBusy(true);setError('');
  const printWindow=channel==='print'?window.open('about:blank','_blank'):null;
  try{
   const provisional_identity=isNew?{first_name:newPatient.first_name.trim(),last_name:newPatient.last_name.trim(),email:email.trim()}:null;
   const r=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'assign',tester:getDemoTesterId(),patient_id:selected.patient_id,appointment_id:selected.appointment_id,provisional_identity,tools,channel,device_id:channel==='tablet'?deviceId:null})});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||'Δεν δημιουργήθηκε η ανάθεση.');
   if(channel==='print'){
    if(printWindow)printWindow.location.href=d.printLink;else window.open(d.printLink,'_blank');
    setDone('Το έντυπο δημιουργήθηκε για '+selected.label+'.');
    onDone?.();
    return;
   }
   if(channel==='email'){
    const mail=await fetch('/api/intake/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intake_id:d.intake.id,token:d.intakeToken,to:email.trim(),tools,doctor_name:account?.identity?.full_name||''})});
    const md=await mail.json();
    if(!mail.ok){
     if(md.code==='connect'&&md.fallback?.subject&&md.fallback?.body){
      window.location.href='mailto:'+encodeURIComponent(email.trim())+'?'+new URLSearchParams({subject:String(md.fallback.subject),body:String(md.fallback.body)}).toString().replaceAll('+','%20');
      setDone('Άνοιξε το email σας με το προσωπικό link έτοιμο για '+selected.label+'.');
      onDone?.();
      return;
     }
     throw new Error(md.error||'Το email δεν στάλθηκε.');
    }
    setDone('Στάλθηκε προσωπικό link στον/στην '+selected.label+'. '+(!selected.patient_id?'Ο φάκελος θα δημιουργηθεί αυτόματα με την υποβολή.':'Οι απαντήσεις θα επιστρέψουν αυτόματα στον φάκελο.'));
    onDone?.();
    return;
   }
   setDone('Η ανάθεση για '+selected.label+' στάλθηκε στο '+(devices.find(x=>x.id===deviceId)?.label||'tablet')+'.');
   onDone?.();
  }catch(e){
   printWindow?.close();
   setError(e instanceof Error?e.message:'Η ανάθεση δεν ολοκληρώθηκε.');
  }finally{inFlight.current=false;setBusy(false)}
 }

 return <div className="intake-launcher-backdrop" onClick={()=>!busy&&onClose()}>
  <section className="intake-launcher assignment-launcher" role="dialog" aria-modal="true" aria-labelledby="assignment-title" onClick={e=>e.stopPropagation()}>
   <button className="intake-launcher-close" onClick={onClose} disabled={busy} aria-label="Κλείσιμο"><X size={18}/></button>
   <span className="kicker">ΑΝΑΘΕΣΗ ΕΡΓΑΛΕΙΟΥ</span>
   <h2 id="assignment-title">Συμπλήρωση από ασθενή</h2>
   <p className="assignment-intro">Επίλεξε σε ποιον προορίζεται το εργαλείο. Αν δεν υπάρχει ακόμη φάκελος ή ραντεβού, μπορείς να ξεκινήσεις ως νέος ασθενής.</p>

   <div className="assignment-step">
    <div className="assignment-step-title"><span>1</span><div><strong>Εργαλείο</strong><small>{lockTools?'Έχει ήδη επιλεγεί από τη Βιβλιοθήκη.':'Επιλέξτε τι θα συμπληρώσει ο ασθενής.'}</small></div></div>
    {lockTools
      ?<div className="assignment-tool-summary">{tools.map(tool=><span key={tool}>{toolLabel(tool)}</span>)}</div>
      :<div className="intake-tool-picker assignment-tool-picker">
        <label><input type="checkbox" checked={tools.includes('history')} onChange={()=>toggle('history')}/><span>Αρχικό ιστορικό</span></label>
        <label><input type="checkbox" checked={tools.includes('PHQ-9')} onChange={()=>toggle('PHQ-9')}/><span>PHQ-9</span></label>
        <label><input type="checkbox" checked={tools.includes('GAD-7')} onChange={()=>toggle('GAD-7')}/><span>GAD-7</span></label>
       </div>}
   </div>

   <div className="assignment-step">
    <div className="assignment-step-title"><span>2</span><div><strong>Σε ποιον</strong><small>{fixed?'Η σύνδεση είναι ήδη καθορισμένη.':'Υπάρχων φάκελος, ραντεβού ή νέος ασθενής.'}</small></div></div>
    {!fixed
      ?<>
        <div className="assignment-subject-modes">
         <button type="button" className={subjectMode==='appointment'?'selected':''} onClick={()=>{setSubjectMode('appointment');setSubject('');setEmail('')}}>Ραντεβού</button>
         <button type="button" className={subjectMode==='patient'?'selected':''} onClick={()=>{setSubjectMode('patient');setSubject('');setEmail('')}}>Υπάρχων ασθενής</button>
         <button type="button" className={subjectMode==='new'?'selected':''} onClick={()=>{setSubjectMode('new');setSubject('');setEmail('')}}>Νέος ασθενής</button>
        </div>
        {subjectMode==='appointment'&&<label className="assignment-subject-select"><select value={subject} onChange={e=>{setSubject(e.target.value);setEmail('')}}>
         <option value="">Επιλέξτε ραντεβού…</option>
         {events.map(e=><option key={e.id} value={'appointment:'+e.id}>{e.patient_name} · {new Intl.DateTimeFormat('el-GR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(e.scheduled_start))}{e.patient_id?'':' · χωρίς φάκελο'}</option>)}
        </select></label>}
        {subjectMode==='patient'&&<label className="assignment-subject-select"><select value={subject} onChange={e=>{setSubject(e.target.value);setEmail('')}}>
         <option value="">Επιλέξτε ασθενή…</option>
         {patients.map(p=><option key={p.id} value={'patient:'+p.id}>{p.first_name} {p.last_name}</option>)}
        </select></label>}
        {subjectMode==='new'&&<div className="assignment-new-patient">
         <label>Όνομα<input value={newPatient.first_name} onChange={e=>setNewPatient(v=>({...v,first_name:e.target.value}))} placeholder="Όνομα"/></label>
         <label>Επώνυμο <span>προαιρετικό</span><input value={newPatient.last_name} onChange={e=>setNewPatient(v=>({...v,last_name:e.target.value}))} placeholder="Επώνυμο"/></label>
         <p>Ο φάκελος δεν δημιουργείται ακόμη. Ο ασθενής θα επιβεβαιώσει τα στοιχεία του και ο φάκελος θα δημιουργηθεί μόνο μετά την υποβολή.</p>
        </div>}
       </>
      :<div className="assignment-subject-summary"><UserRound size={17}/><div><strong>{selected.label}</strong><span>{selected.hint}</span></div><Check size={16}/></div>}
    {!fixed&&((subjectMode==='new'&&newPatient.first_name.trim())||subject)&&<div className="assignment-subject-confirm"><UserRound size={16}/><div><strong>{selected.label}</strong><span>{selected.hint}</span></div></div>}
   </div>

   <div className="assignment-step">
    <div className="assignment-step-title"><span>3</span><div><strong>Τρόπος συμπλήρωσης</strong><small>Το αποτέλεσμα θα επιστρέψει στην ίδια ανάθεση ανεξάρτητα από τον τρόπο.</small></div></div>
    <div className="intake-channel-picker">
     <button className={channel==='tablet'?'selected':''} onClick={()=>setChannel('tablet')}><Tablet size={18}/> Tablet</button>
     <button className={channel==='email'?'selected':''} onClick={()=>setChannel('email')}><Mail size={18}/> Email</button>
     <button className={channel==='print'?'selected':''} onClick={()=>setChannel('print')}><Printer size={18}/> Εκτύπωση</button>
    </div>
    {channel==='tablet'&&<div className="intake-channel-detail">{devices.length?<label>Συσκευή<select value={deviceId} onChange={e=>setDeviceId(e.target.value)}>{devices.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label>:<p>Δεν έχει συνδεθεί tablet. <Link href="/tablet" target="_blank">Άνοιγμα λειτουργίας Tablet ↗</Link></p>}</div>}
    {channel==='email'&&<div className="assignment-email-wrap"><label className="assignment-email">Email παραλήπτη<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="patient@example.com"/></label><p>Ο ασθενής θα λάβει προσωπικό link. Δεν χρειάζεται λογαριασμό· συμπληρώνει online και η υποβολή επιστρέφει αυτόματα σε αυτή την ανάθεση.</p></div>}
    {channel==='print'&&<div className="intake-channel-detail"><p>Το έντυπο θα φέρει μοναδικό κωδικό αυτής της ανάθεσης. Όταν εισαχθεί ξανά στο Noima, το αποτέλεσμα θα επιστρέψει στην ίδια ανάθεση και, αν δεν υπάρχει φάκελος, θα δημιουργηθεί μετά την καταχώριση.</p></div>}
   </div>

   {done&&<div className="intake-launcher-success"><Check size={16}/>{done}</div>}
   {error&&<p className="intake-error" role="alert">{error}</p>}
   <footer>
    <button onClick={onClose} disabled={busy}>Κλείσιμο</button>
    <button className="intake-primary" disabled={busy||Boolean(done)} onClick={()=>void send()}>{busy?'Προετοιμασία…':channel==='tablet'?'Αποστολή στο tablet':channel==='email'?'Αποστολή email':'Άνοιγμα για εκτύπωση'}</button>
   </footer>
  </section>
 </div>;
}
