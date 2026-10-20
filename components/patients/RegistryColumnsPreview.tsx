'use client';
import {useTranslations} from 'next-intl';
import {useEffect,useState} from 'react';
import Patients from '@/app/patients/page';
import {registrySimulation} from '@/lib/patients/registry-simulation';
export default function RegistryColumnsPreview(){
 const t=useTranslations();

 const [ready,setReady]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{
  const original=window.fetch;
  const fixtureFetch:typeof fetch=async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
   if(url.origin===location.origin&&url.pathname==='/api/patients/demo/runtime'){
    const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    if(method==='GET'&&!url.searchParams.has('patient')&&!url.searchParams.has('session'))return Response.json({patients:registrySimulation});
    return Response.json({error:'Οι εγγραφές είναι απενεργοποιημένες στη συνθετική προεπισκόπηση.'},{status:403});
   }
   return original.call(window,input,init);
  };
  window.fetch=fixtureFetch;setReady(true);
  return()=>{if(window.fetch===fixtureFetch)window.fetch=original};
 },[]);
 return <div onClickCapture={event=>{const anchor=(event.target as HTMLElement).closest('a');if(anchor&&/^\/(patients\/(demo\/|new)|calendar)/.test(new URL(anchor.href,location.origin).pathname)){event.preventDefault();event.stopPropagation();setNotice('Συνθετικό παράδειγμα · οι ενέργειες ασθενών δεν εκτελούνται εδώ. Οι ρυθμίσεις στηλών λειτουργούν κανονικά.')}}}>
  <p className="record-state" role="status">{t('current.m180')}</p>
  {notice&&<p className="record-state" role="status">{notice}</p>}
  {ready?<Patients/>:<p role="status">{t('current.m181')}</p>}
 </div>;
}
