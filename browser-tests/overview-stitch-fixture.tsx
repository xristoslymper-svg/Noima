import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CalendarDays,ClipboardCheck,TestTube2,CreditCard,Home,Users,BookOpen} from 'lucide-react';
import DailyAgenda from '../components/overview/DailyAgenda';
import '../app/globals.css';
import '../app/overview-stitch.css';

const count=Math.min(18,Math.max(0,Number(new URLSearchParams(location.search).get('count')||'5')));
const names=['Δόκιμος Δοκίμου','Μαρία Παπαδοπούλου','Αλέξανδρος Ιωαννίδης','Ελένη Γεωργίου','Νικόλαος Αντωνίου','Μαρία με ιδιαίτερα μεγάλο επώνυμο και δεύτερο όνομα','Σοφία Κωνσταντίνου','Ιωάννης Καραγιάννης','Αθηνά Δημητρίου','Γιώργος Θεοδώρου','Πηνελόπη Σταυροπούλου','Κωνσταντίνος Μακρυγιάννης'];
const events=Array.from({length:count},(_,i)=>{
 const minutes=9*60+i*35,h=String(Math.floor(minutes/60)).padStart(2,'0'),m=String(minutes%60).padStart(2,'0');
 const stamp='2026-10-11T'+h+':'+m+':00+03:00';
 const dateEnd='2026-10-11T'+String(Math.floor((minutes+30)/60)).padStart(2,'0')+':'+String((minutes+30)%60).padStart(2,'0')+':00+03:00';
 return {id:'appointment-'+i,patient_id:'40000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),patient_name:names[i%names.length],appointment_type:i%4===0?'initial_assessment':'follow_up',status:i===0&&count>1?'completed':'scheduled',readiness:i===2?'waiting':'ready',readiness_label:i===2?'Σε αναμονή':'Έτοιμη',detail:'',scheduled_start:stamp,scheduled_end:dateEnd};
});
function Card({name,value,icon,tone}:{name:string;value:string;icon:React.ReactNode;tone:string}){
 return <div className={'metric '+tone}><span>{name}</span><div className="metric-icon">{icon}</div><strong>{value}</strong></div>
}
function Fixture(){
 const [selected,setSelected]=useState<string|null>(events[0]?.patient_id||null);
 const person=events.find(e=>e.patient_id===selected);
 return <main className="app-shell overview-stitch-shell">
   <aside className="sidebar">
    <div className="brand"><div className="brand-mark">Ψ</div><div className="brand-copy"><div className="brand-sub">Για μια οργανωμένη<br/>κλινική πράξη</div></div></div>
    <nav className="nav">
     <div className="nav-item active"><Home size={19}/><span>Επισκόπηση</span></div>
     <div className="nav-item"><CalendarDays size={19}/><span>Ημερολόγιο</span></div>
     <div className="nav-item"><Users size={19}/><span>Ασθενείς</span></div>
     <div className="nav-item"><BookOpen size={19}/><span>Βιβλιοθήκη</span></div>
    </nav>
   </aside>
   <section className="workspace">
    <header className="topbar"><div className="profile"><div className="avatar">Δ</div><div className="profile-copy"><strong>Δοκιμαστικός Ιατρός</strong><span>Συνθετικά δεδομένα</span></div><span className="pilot-badge">DEMO</span></div></header>
    <div className="content overview-stitch">
     <div className="page-heading"><div><p className="eyebrow">ΚΥΡΙΑΚΗ 11 ΟΚΤΩΒΡΙΟΥ</p><h1>Η ημέρα σας, με μια ματιά</h1><p>Ραντεβού, ασθενείς και εκκρεμότητες σε ένα μέρος.</p></div></div>
     <section className="metric-grid" aria-label="Μετρήσεις"><Card name="Επόμενα ραντεβού σήμερα" value={String(count)} tone="sage" icon={<CalendarDays/>}/><Card name="Εκκρεμότητες" value="6" tone="rose" icon={<ClipboardCheck/>}/><Card name="Υποβολές ασθενών" value="2" tone="gold" icon={<TestTube2/>}/><Card name="Πληρωμές" value="0" tone="blue" icon={<CreditCard/>}/></section>
     <section className="main-grid overview-stitch-grid">
       <div className="card sessions overview-stitch-sessions"><DailyAgenda events={events} selectedPatientId={selected} state="ready" onSelectPatient={setSelected}/></div>
       <div className="card ai-brief" data-brief-for={selected||''}>
         {selected?<><div className="card-head"><span className="status-dot">{person?.patient_name}</span></div><section className="clinical-summary"><header className="clinical-summary-head"><span className="summary-editorial-kicker">ΠΡΙΝ ΤΗΝ ΕΠΙΣΚΕΨΗ</span><h2>Σύντομη κλινική εικόνα</h2></header><p style={{lineHeight:1.65}}>Ενδεικτική κλινική περιοχή για τον επιλεγμένο συνθετικό ασθενή. Δεν χρησιμοποιείται πραγματικός φάκελος.</p></section></>:
         <div className="overview-stitch-brief-empty"><div className="overview-empty-brief-kicker">ΠΡΙΝ ΤΗΝ ΕΠΙΣΚΕΨΗ</div><h2>Σύντομη κλινική εικόνα</h2><div className="overview-empty-brief-body">Όταν επιλέξετε ραντεβού, θα εμφανιστούν τα στοιχεία του ασθενούς.</div></div>}
       </div>
     </section>
    </div>
   </section>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
