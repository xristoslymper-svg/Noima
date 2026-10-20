'use client';
import {useTranslations} from 'next-intl';
import {useState} from 'react';
import {Link2,Copy} from 'lucide-react';
import {demoInvitation,readDemoInvitation} from '@/lib/teleconsultations/entry';
import type {FixtureRecord} from '@/lib/teleconsultations/preview';
import styles from './Teleconsultations.module.css';
export default function TeleInvitation({record}:{record:FixtureRecord}){
 const t=useTranslations();

 const [url,setUrl]=useState(''),[copied,setCopied]=useState('');
 function prepare(){
  const existing=url.split('#')[1];if(existing&&readDemoInvitation(existing,Date.now()))return;
  const invitation=demoInvitation(record,Date.now(),crypto.randomUUID());
  setUrl(location.origin+'/assessment/teleconsultation-preview#'+invitation.token);setCopied('');
 }
 async function copyLink(){try{await navigator.clipboard.writeText(url);setCopied('Το link αντιγράφηκε.')}catch{setCopied('Επιλέξτε και αντιγράψτε το link από το πεδίο.')}}
 return <details className={styles.invitation}><summary onClick={prepare}><Link2 size={16}/>{t('current.m286')}</summary><div className={styles.invitationPanel}><strong>{t('current.m287')}</strong><p>{t('current.m288')}</p><label>{t('current.m289')}<input aria-label={t('current.m289')} readOnly value={url} onFocus={event=>event.target.select()}/></label><div className={styles.actions}><button type="button" className="small-button" onClick={()=>void copyLink()}><Copy size={14}/>{t('current.m290')}</button><a className="small-button" href={url} target="_blank" rel="noreferrer">{t('current.m291')}</a></div><p role="status">{copied}</p><small>{t('current.m292')}</small></div></details>;
}
