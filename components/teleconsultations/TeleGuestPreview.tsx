'use client';
import {useTranslations} from 'next-intl';
import {useEffect,useState} from 'react';
import {Video} from 'lucide-react';
import {readDemoInvitation} from '@/lib/teleconsultations/entry';
import styles from './Teleconsultations.module.css';
export default function TeleGuestPreview(){
 const t=useTranslations();

 const [state,setState]=useState<'loading'|'ready'|'waiting'|'expired'>('loading');
 useEffect(()=>{const check=()=>setState(previous=>readDemoInvitation(location.hash.slice(1),Date.now())?(previous==='waiting'?'waiting':'ready'):'expired');check();const timer=setInterval(check,15000);window.addEventListener('hashchange',check);return()=>{clearInterval(timer);window.removeEventListener('hashchange',check)}},[]);
 return <main className={styles.guest}><section className="card"><Video size={28}/><h1>{t('current.m228')}</h1><p>{t('current.m229')}</p>{state==='loading'?<p role="status">{t('current.m230')}</p>:state==='expired'?<p role="alert">{t('current.m231')}</p>:state==='waiting'?<div role="status"><h2>{t('current.m232')}</h2><p>{t('current.m233')}</p><button type="button" className="small-button" onClick={()=>setState('ready')}>{t('current.m234')}</button></div>:<><p>{t('current.m235')}</p><button type="button" className="record compact" onClick={()=>setState(readDemoInvitation(location.hash.slice(1),Date.now())?'waiting':'expired')}>{t('current.m236')}</button></>}<p className={styles.notice}>{t('current.m237')}</p></section></main>;
}
