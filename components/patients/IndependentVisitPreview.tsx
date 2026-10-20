'use client';
import {useEffect,useState} from 'react';
import PatientWorkspace from './PatientWorkspace';
import fixture from '@/browser-tests/fixtures/warm-patient.json';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {simulateVisitWrite} from '@/lib/patients/visit-simulation';
const storageKey='noima-independent-visits-synthetic-v1';
export default function IndependentVisitPreview(){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  let bundle=structuredClone(fixture) as unknown as PatientBundle;
  try{const saved=sessionStorage.getItem(storageKey);if(saved){const parsed=JSON.parse(saved) as PatientBundle;if(parsed.patient.id===bundle.patient.id)bundle=parsed}}catch{}
  const original=window.fetch;
  const localFetch:typeof fetch=async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
   if(url.origin!==location.origin)return Response.json({error:'Η συνθετική δοκιμή δεν συνδέεται με εξωτερικές υπηρεσίες.'},{status:403});
   if(!url.pathname.startsWith('/api/'))return original(input,init);
   if(url.pathname.startsWith('/api/pilot')&&(!init?.method||init.method==='GET'))return original(input,init);
   if(url.pathname.includes('summary'))return Response.json({error:'Η AI σύνοψη δεν εκτελείται στη συνθετική δοκιμή.'},{status:503});
   if(url.pathname==='/api/patients/demo/runtime'||url.pathname==='/api/patients/demo/visit'){
    if(init?.method==='POST'){
     try{const body=JSON.parse(String(init.body||'{}'));const next=structuredClone(bundle);const result=simulateVisitWrite(next,body,new Date().toISOString());sessionStorage.setItem(storageKey,JSON.stringify(next));bundle=next;return Response.json(result)}catch(error){return Response.json({error:error instanceof Error?error.message:'Δεν αποθηκεύτηκε η συνθετική αλλαγή.'},{status:409})}
    }
    const selected=url.searchParams.get('session');
    return Response.json({bundle:selected?{...bundle,sessions:bundle.sessions.filter(s=>s.id===selected)}:bundle});
   }
   if(url.pathname==='/api/intake'&&(!init?.method||init.method==='GET'))return Response.json({intakes:[]});
   if(url.pathname==='/api/intake'&&init?.method==='POST'&&JSON.parse(String(init.body||'{}')).action==='list')return Response.json({intakes:[]});
   if(url.pathname==='/api/patients/demo/prior-course')return Response.json({record:null});
   return Response.json({error:'Η ενέργεια είναι απενεργοποιημένη στη συνθετική δοκιμή. Δεν έγινε εγγραφή στη βάση.'},{status:403});
  };
  window.fetch=localFetch;setReady(true);
  return()=>{if(window.fetch===localFetch)window.fetch=original};
 },[]);
 return <>{ready?<><p className="record-state" role="status">Απομονωμένη συνθετική δοκιμή · Οι αλλαγές διατηρούνται με refresh σε αυτό το tab · Χωρίς εγγραφές στη βάση</p><PatientWorkspace patientRef={fixture.patient.id}/></>:<p className="record-state">Άνοιγμα συνθετικής δοκιμής…</p>}</>;
}
