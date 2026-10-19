'use client';
import type {Practice,SectionId} from '@/lib/presence/model';
import {titles} from '@/lib/presence/model';
import {MapPin,Phone,Clock,Video,CalendarDays} from 'lucide-react';
import styles from './Presence.module.css';
export default function PracticePage({practice,selected,onRequest}:{practice:Practice;selected?:SectionId;onRequest?:()=>void}){
 return <article className={styles.publicPage} aria-label="Σελίδα ασθενή"><div className={styles.publicBrand}><span>Ψ</span><strong>NOIMA</strong><small>Η σελίδα του ιατρείου</small></div>{practice.order.filter(id=>practice.visible[id]).map(id=><section key={id} className={selected===id?styles.highlight:''} aria-label={titles[id]}>
 {selected===id&&<small className={styles.selectedLabel}>Επεξεργασία: {titles[id]}</small>}
 {id==='intro'?<><div className={styles.identity}><div className={styles.avatar} style={practice.photo?{backgroundImage:'url('+practice.photo+')'}:{}} role="img" aria-label="Φωτογραφία ιατρού">{practice.photo?'':'ΑΔ'}</div><div><h2>{practice.name||'Το όνομά σας'}</h2><p>{practice.specialty}</p></div></div><div className={styles.badges}><span><MapPin size={12}/>Δια ζώσης · Αθήνα</span>{practice.online&&<span><Video size={12}/>Online</span>}</div><p>{practice.welcome}</p></>:id==='contact'?<><h3>Ας προγραμματίσουμε τη συνάντησή σας</h3><p>Στείλτε αίτημα για την ημέρα και ώρα που σας εξυπηρετεί. Το ιατρείο θα επικοινωνήσει για επιβεβαίωση.</p><button type="button" className="record compact" onClick={onRequest} disabled={!onRequest}><CalendarDays size={15}/>Αίτημα ραντεβού</button><div className={styles.contact}><span><Phone size={14}/>{practice.phone}</span><span>{practice.email}</span><span><Clock size={14}/>{practice.hours}</span></div></>:<><h3>{titles[id]}</h3><p className={styles.preserve}>{practice[id]}</p></>}
 </section>)}<footer>Συνθετικό παράδειγμα · Δεν αποστέλλονται στοιχεία σε ιατρείο.</footer></article>
}
