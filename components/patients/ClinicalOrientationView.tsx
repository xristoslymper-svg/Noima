'use client';
import Link from 'next/link';
import type {ClinicalCard,CardItem} from '@/lib/clinical/clinical-card';
import {formatClinicDateTime} from '@/lib/clinic-time';

export default function ClinicalOrientationView({card,patientId}:{card:ClinicalCard;patientId:string}){
 function bullets(items:CardItem[]){
  return <ul className="orientation-list">{items.flatMap((item,i)=>item.text.split(/\n+/u).filter(line=>line.trim()).map((line,j)=>{
   const match=line.match(/^(\d{4}-\d{2}-\d{2}) · (.*)$/u);
   const text=(match?match[2]:line).replace(/^Συνθετική κλινική εκτίμηση:\s*/u,'Κλινική εκτίμηση: ').replace(/^Συνθετικό πλάνο(?=:| επανελέγχου)/u,'Πλάνο');
   const colon=text.indexOf(':');
   return <li key={i+'-'+j}><span>{colon>0&&colon<65?<><strong>{text.slice(0,colon+1)}</strong>{text.slice(colon+1)}</>:text}</span>{match&&<time dateTime={match[1]}>{match[1].split('-').reverse().join('/')}</time>}</li>;
  }))}</ul>;
 }
 function sources(items:CardItem[]){
  const evidence=card.sources.filter(s=>items.some(i=>i.source_ids.includes(s.id)));
  return evidence.length>0&&<details className="orientation-sources"><summary>Πηγές</summary>{evidence.map(s=>{
   const tab=s.kind==='prior_course'?'timeline':s.target;
   return <Link key={s.id} href={'/patients/demo/'+encodeURIComponent(patientId)+'?tab='+tab+(s.session_id?'&session='+encodeURIComponent(s.session_id):'')+(s.kind==='psychometric'?'&assessment='+���q�^