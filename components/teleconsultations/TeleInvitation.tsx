'use client';
import {useState} from 'react';
import {Link2,Copy} from 'lucide-react';
import {demoInvitation,readDemoInvitation} from '@/lib/teleconsultations/entry';
import type {FixtureRecord} from '@/lib/teleconsultations/preview';
import styles from './Teleconsultations.module.css';
export default function TeleInvitation({record}:{record:FixtureRecord}){
 const [url,setUrl]=useState(''),[copied,setCopied]=useState('');
 function prepare(){
  const existing=url.split('#')[1];if(existing&&readDemoInvitation(existing,Date.now()))return;
  const invitation=demoInvitation(record,Date.now(),crypto.randomUUID());
  setUrl(location.origin+'/assessment/teleconsultation-preview#'+invitation.token);setCopied('');
 }
 async function copyLink(){try{await navigator.clipboard.writeText(url);setCopied('Το link αντιγράφηκε.')}catch{setCopied('Επιλέξτε και αντιγράψτε το link από το πεδίο.')}}
 return <details className={styles.invitation}><summary onClick={prepare}><Link2 size={16}/>Πρόσκληση με link</summary><div className={styles.invitationPanel}><strong>Δοκιμαστική πρόσκληση</strong><p>Για την ίδια επίσκεψη · λήξη σε 60 λεπτά από τη δημιουργία. Χωρίς πραγματική κλήση ή αποστολή email.</p><label>Link πρόσκλησης<input aria-label="Link πρόσκλησης" readOnly value={url} onFocus={event=>event.target.select()}/></label><div className={styles.actions}><button type="button" className="small-button" onClick={()=>void copyLink()}><Copy size={14}/>Αντιγραφή link</button><a className="small-button" href={url} target="_blank" rel="noreferrer">Προεπισκόπηση πρόσκλησης</a></div><p role="status">{copied}</p><small>Μόνο συνθετικό παράδειγμα. Δεν δίνει πρόσβαση σε φάκελο ή σημειώσεις.</small></div></details>;
}
