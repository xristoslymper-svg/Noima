'use client';
import {useEffect,useState} from 'react';
import {Video} from 'lucide-react';
import {readDemoInvitation} from '@/lib/teleconsultations/entry';
import styles from './Teleconsultations.module.css';
export default function TeleGuestPreview(){
 const [state,setState]=useState<'loading'|'ready'|'waiting'|'expired'>('loading');
 useEffect(()=>{const check=()=>setState(previous=>readDemoInvitation(location.hash.slice(1),Date.now())?(previous==='waiting'?'waiting':'ready'):'expired');check();const timer=setInterval(check,15000);window.addEventListener('hashchange',check);return()=>{clearInterval(timer);window.removeEventListener('hashchange',check)}},[]);
 return <main className={styles.guest}><section className="card"><Video size={28}/><h1>NOIMA · Τηλεσυνεδρία</h1><p>Συνθετική πρόσκληση · χωρίς πραγματική κλήση.</p>{state==='loading'?<p role="status">Έλεγχος πρόσκλησης…</p>:state==='expired'?<p role="alert">Η δοκιμαστική πρόσκληση έληξε ή δεν είναι έγκυρη. Ζητήστε νέο link από τον γιατρό.</p>:state==='waiting'?<div role="status"><h2>Προσομοίωση αναμονής</h2><p>Σε πραγματική συνεδρία ο γιατρός θα επιβεβαιώνει την είσοδό σας. Στη δοκιμή δεν ειδοποιείται γιατρός και δεν μεταδίδεται εικόνα ή ήχος.</p><button type="button" className="small-button" onClick={()=>setState('ready')}>Έξοδος από την αναμονή</button></div>:<><p>Η πρόσκληση αφορά μία συγκεκριμένη συνθετική επίσκεψη. Δεν χρειάζεται λογαριασμός NOIMA.</p><button type="button" className="record compact" onClick={()=>setState(readDemoInvitation(location.hash.slice(1),Date.now())?'waiting':'expired')}>Δοκιμή εισόδου</button></>}<p className={styles.notice}>Δεν ζητείται πρόσβαση σε κάμερα ή μικρόφωνο. Δεν προβάλλονται στοιχεία φακέλου ή σημειώσεις.</p></section></main>;
}
