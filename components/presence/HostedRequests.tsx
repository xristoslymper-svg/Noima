'use client';
import {useTranslations} from 'next-intl';
import {useEffect,useState} from 'react';
import BookingRequests from './BookingRequests';
import styles from './Presence.module.css';
type Item={id:string;created_at:string;payload:{name:string;email:string;phone:string;kind:string;preference:string}};
export default function HostedRequests(){
 const t=useTranslations();
const [items,setItems]=useState<Item[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(true),[retry,setRetry]=useState(0);
 useEffect(()=>{const c=new AbortController();setBusy(true);fetch('/api/presence',{cache:'no-store',signal:c.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);setItems(b.requests);setError('')}).catch(e=>{if(e.name!=='AbortError')setError('Δεν φορτώθηκαν τα αιτήματα. Δοκιμάστε ξανά.')}).finally(()=>{if(!c.signal.aborted)setBusy(false)});return()=>c.abort()},[retry]);
 return <><BookingRequests/><section className={styles.requests}><h2>{t('current.m223')}</h2><p>{t('current.m224')}</p><button className="small-button" disabled={busy} onClick={()=>setRetry(v=>v+1)}>{t('current.m225')}</button>{error&&<p role="alert">{error}</p>}{busy?<p role="status">{t('common.loading')}</p>:!items.length?<p>{t('current.m226')}</p>:items.map(x=><article key={x.id}><h3>{x.payload.name}</h3><p>{x.payload.kind} · {x.payload.preference}</p><p>{x.payload.email} · {x.payload.phone}</p><strong>{t('current.m227')}</strong><p>{new Date(x.created_at).toLocaleString('el-GR')}</p></article>)}</section></>
}
