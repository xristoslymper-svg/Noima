'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useTranslations} from 'next-intl';
import {useState,useRef} from 'react';
import {MapPin,ShieldCheck,Link2,Circle,Unplug,ArrowRight} from 'lucide-react';
import {syntheticBusiness,differences,applyDemoChanges,fieldLabels,type Business,type ProfileField} from '@/lib/presence/google-maps';
import type {Practice} from '@/lib/presence/model';
import styles from './Presence.module.css';

export default function GoogleMaps({practice}:{practice:Practice}){
 const ui=useUiText();

 const t=useTranslations();

 const [step,setStep]=useState<'idle'|'consent'|'select'|'linked'>('idle');
 const [remote,setRemote]=useState<Business>({...syntheticBusiness});
 const [selected,setSelected]=useState<ProfileField[]>([]);
 const [status,setStatus]=useState(''),[confirm,setConfirm]=useState(false);
 const title=useRef<HTMLHeadingElement>(null);
 const local:Business={id:syntheticBusiness.id,name:syntheticBusiness.name,phone:practice.phone,city:practice.city,hours:practice.hours,website:'https://psi-space.example/iatreio/anna-deigma'};
 const changed=differences(local,remote);
 function transition(next:typeof step){setStep(next);setConfirm(false);setSelected([]);setStatus('');requestAnimationFrame(()=>title.current?.focus())}
 function disconnect(){transition('idle');setRemote({...syntheticBusiness});setStatus('Η προσομοίωση αποσυνδέθηκε. Δεν υπήρξε σύνδεση Google.')}
 return <section aria-label="Google & Maps" className={styles.googleArea}>
 <div className={styles.editor}><div className={styles.googleHeading}><div><p className={styles.eyebrow}>GOOGLE & MAPS</p><h2>{t('current.m399')}</h2><p className={styles.help}>{t('current.m400')}</p></div><MapPin size={25}/></div>
 <p className={styles.notice}><ShieldCheck size={14}/>{t('current.m401')}</p>
 <div className={styles.actions}><button className="small-button" disabled type="button"><Link2 size={14}/>{t('current.m402')}</button>{step==='idle'&&<button className="small-button" type="button" onClick={()=>transition('consent')}>{t('current.m403')}<ArrowRight size={14}/></button>}</div>
 </div>
 <div className={styles.editor}><div className={styles.googleHeading}><h2 ref={title} tabIndex={-1}>{step==='idle'?ui('Πριν από την πραγματική σύνδεση'):step==='consent'?ui('1. Εσείς δίνετε την άδεια'):step==='select'?ui('2. Επιλέγετε το ιατρείο'):ui('3. Ελέγχετε τις διαφορές')}</h2>{step!=='idle'&&<span className={styles.publicationState}>{t('current.m404')}</span>}</div>
 {step==='idle'?<><p className={styles.help}>{t('current.m405')}</p><ul className={styles.googleChecklist}><li><Circle size={14}/>{t('current.m406')}</li><li><Circle size={14}/>{t('current.m407')}</li><li><Circle size={14}/>{t('current.m408')}</li></ul><p className={styles.help}>{t('current.m409')}</p></>:step==='consent'?<><p className={styles.help}>{t('current.m410')}</p><p className={styles.help}>{t('current.m411')}</p><div className={styles.actions}><button className="small-button" onClick={()=>transition('select')}>{t('current.m412')}</button><button className="small-button" onClick={()=>{transition('idle');setStatus('Δεν δόθηκε άδεια. Μπορείτε να δοκιμάσετε ξανά.')}}>{t('current.m413')}</button></div></>:step==='select'?<><p className={styles.help}>{t('current.m414')}</p><div className={styles.contentItem}><strong>{syntheticBusiness.name}</strong><p className={styles.help}>{syntheticBusiness.city} · {syntheticBusiness.phone}</p><button className="small-button" onClick={()=>transition('linked')}>{t('current.m415')}</button></div><button className="small-button" onClick={()=>transition('idle')}>{t('current.m416')}</button></>:<><p className={styles.help}>{syntheticBusiness.name} {t('polish.m068')}</p>
 <div className={styles.googleCompare} role="group" aria-label={t('current.m423')}>{(['phone','city','hours','website'] as ProfileField[]).map(field=><div key={field} className={styles.googleRow}><label className={styles.check}><input type="checkbox" disabled={!changed.includes(field)||confirm} checked={selected.includes(field)} onChange={e=>{setSelected(s=>e.target.checked?[...s,field]:s.filter(k=>k!==field));setStatus('')}}/>{fieldLabels[field]}</label><div><small>{t('current.m417')}</small><p>{local[field]||ui('Δεν έχει συμπληρωθεί')}</p></div><div><small>{t('current.m418')}</small><p>{remote[field]||ui('Δεν έχει συμπληρωθεί')}</p></div></div>)}</div>
 <p className={styles.help}>{t('current.m419')}</p>
 {confirm?<div className={styles.notice}><p>{t('polish.m069')} {selected.length} {t('polish.m070')}</p><div className={styles.actions}><button className="small-button" onClick={()=>{setRemote(applyDemoChanges(local,remote,selected,true));setSelected([]);setConfirm(false);setStatus('Οι αλλαγές εφαρμόστηκαν μόνο στο συνθετικό προφίλ. Καμία ενημέρωση στη Google.')}}>{t('current.m339')}</button><button className="small-button" onClick={()=>setConfirm(false)}>{t('current.m420')}</button></div></div>:<div className={styles.actions}><button className="small-button" disabled={!selected.length} onClick={()=>setConfirm(true)}>{t('polish.m071')}{selected.length})</button><button className="small-button" onClick={disconnect}><Unplug size={14}/>{t('current.m421')}</button></div>}</>}
 <p role="status" className={styles.help}>{ui(status)}</p>{step!=='idle'&&<p className={styles.help}>{t('current.m422')}</p>}</div>
 </section>
}
