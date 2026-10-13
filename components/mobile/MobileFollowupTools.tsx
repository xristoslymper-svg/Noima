'use client';
import {useId} from 'react';
import {mobileV2Enabled} from './mobile-v2';
import styles from './MobileClinical.module.css';
export default function MobileFollowupTools(){
 const id=useId();
 if(!mobileV2Enabled)return null;
 return <div className={styles.shortcuts}>
  <label htmlFor={id}>Μετάβαση σε ενότητα</label>
  <select id={id} defaultValue="" onChange={e=>{
   const root=e.currentTarget.closest('[data-clinical-followup]');
   const target=root?.querySelector<HTMLElement>(`[data-mobile-section="${e.currentTarget.value}"]`);
   if(target){if(target instanceof HTMLDetailsElement)target.open=true;target.scrollIntoView({block:'start'});target.focus({preventScroll:true})}
   e.currentTarget.value='';
  }}>
   <option value="" disabled>Επιλογή ενότητας…</option>
   <option value="notes">Σημειώσεις επίσκεψης</option>
   <option value="clinical">Κλινική καταγραφή</option>
   <option value="medication">Αγωγή</option>
   <option value="mse">MSE</option>
   <option value="risk">Κίνδυνος</option>
   <option value="measures">Ψυχομετρικές μετρήσεις</option>
   <option value="appointment">Επόμενο ραντεβού</option>
  </select>
 </div>;
}
