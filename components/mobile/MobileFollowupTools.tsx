'use client';
import {useTranslations} from 'next-intl';

import {useId} from 'react';
import {mobileV2Enabled} from './mobile-v2';
import styles from './MobileClinical.module.css';
export default function MobileFollowupTools(){
 const t=useTranslations();

 const id=useId();
 if(!mobileV2Enabled)return null;
 return <div className={styles.shortcuts}>
  <label htmlFor={id}>{t('accessibility.goToSection')}</label>
  <select id={id} defaultValue="" onChange={e=>{
   const root=e.currentTarget.closest('[data-clinical-followup]');
   const target=root?.querySelector<HTMLElement>(`[data-mobile-section="${e.currentTarget.value}"]`);
   if(target){if(target instanceof HTMLDetailsElement)target.open=true;target.scrollIntoView({block:'start'});target.focus({preventScroll:true})}
   e.currentTarget.value='';
  }}>
   <option value="" disabled>{t('visits.selectSection')}</option>
   <option value="notes">{t('visits.visitNotes')}</option>
   <option value="clinical">{t('clinical.clinicalEntry')}</option>
   <option value="medication">{t('medications.medication')}</option>
   <option value="mse">MSE</option>
   <option value="risk">{t('clinical.risk')}</option>
   <option value="measures">{t('psychometrics.measures')}</option>
   <option value="appointment">{t('calendar.nextAppointment')}</option>
  </select>
 </div>;
}
