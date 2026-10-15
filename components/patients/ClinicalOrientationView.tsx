'use client';
import {useLocale} from 'next-intl';

import Link from 'next/link';
import type {ClinicalCard,CardItem} from '@/lib/clinical/clinical-card';
import {formatClinicDateTime} from '@/lib/clinic-time';

export default function ClinicalOrientationView({card,patientId}:{card:ClinicalCard;patientId:string}){
 const locale=useLocale();

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
   const tab=s.target;
   return <Link key={s.id} href={'/patients/demo/'+encodeURIComponent(patientId)+'?tab='+tab+(s.session_id?'&session='+encodeURIComponent(s.session_id):'')+(s.kind==='psychometric'?'&assessment='+encodeURIComponent(s.record_id):'')}>{s.label}</Link>;
  })}</details>;
 }
 return <div className="clinical-orientation">
  <p className="orientation-date">{card.date?'Τελευταία ολοκληρωμένη επίσκεψη · '+formatClinicDateTime(card.date, locale):'Δεν υπάρχει ολοκληρωμένη επίσκεψη'}</p>
  <dl>{card.orientation?.map(row=><div className="orientation-row" key={row.label}><dt>{row.label==='Κλινική εικόνα'?'Διάγνωση & εκτίμηση':row.label}</dt><dd>{row.items.length?bullets(row.items):<p className="orientation-empty">{row.empty}</p>}{sources(row.items)}{Boolean(row.history?.length)&&<details className="orientation-history"><summary>{row.label==='Επόμενη επανεκτίμηση'?'Παλαιότερα καταγεγραμμένα πλάνα · ιστορικό, όχι επιβεβαιωμένες εκκρεμότητες':row.label==='Σημαντικό πλαίσιο'?'Καταγεγραμμένο ιστορικό':'Παλαιότερες καταγραφές'} ({row.history!.length})</summary>{bullets(row.history!)}{sources(row.history!)}</details>}</dd></div>)}</dl>
  {card.alerts.length>0&&<section className="orientation-risk" aria-label="Κίνδυνος και σημεία ελέγχου"><h3>Κίνδυνος & σημεία ελέγχου</h3>{bullets(card.alerts)}{sources(card.alerts)}</section>}
  {card.corrections.length>0&&<details className="orientation-history"><summary>Καταγεγραμμένες διορθώσεις ({card.corrections.length})</summary>{card.corrections.map(f=><p key={f.key}>{f.text}</p>)}{sources(card.corrections)}</details>}
  <style jsx>{`.clinical-orientation{color:#293e35;line-height:1.65;max-width:920px;margin-inline:auto;font-family:inherit}.orientation-date{font-size:12px;color:#728278;margin:0 0 18px}.clinical-orientation dl{margin:0}.orientation-row{display:grid;grid-template-columns:145px minmax(0,1fr);gap:20px;padding:20px 0;border-top:1px solid #dfe8e1}.orientation-row dt{font-size:14px;font-weight:650;color:#50745e}.orientation-row dd{margin:0;min-width:0}.clinical-orientation p{margin:0 0 9px;white-space:pre-wrap;overflow-wrap:anywhere}.orientation-row p{font-size:14px}.orientation-empty{color:#728278;font-size:13px!important}.orientation-history{margin-top:10px;font-size:12px;color:#667b6f}.orientation-history summary,.orientation-sources summary{cursor:pointer}.orientation-history p{margin-top:12px;color:#293e35}.orientation-sources{font-size:11px;color:#728278}.orientation-risk{border-top:1px solid #dfe8e1;padding:20px 0;font-size:13px}.orientation-risk h3{font-size:14px;color:#50745e;margin:0 0 12px}@media(max-width:700px){.orientation-row{grid-template-columns:1fr;gap:9px;padding:16px 0}}`}</style>
  <style jsx global>{`.clinical-orientation .orientation-sources{font-size:11px;color:#728278;margin-top:9px}.clinical-orientation .orientation-sources summary{cursor:pointer}.clinical-orientation .orientation-sources a{display:block;color:#50745e;font-size:11px;margin-top:4px}.clinical-orientation .orientation-list{margin:0;padding-left:18px}.clinical-orientation .orientation-list li{padding:0 0 12px;font-size:14px;overflow-wrap:anywhere}.clinical-orientation .orientation-list li:last-child{padding-bottom:0}.clinical-orientation .orientation-list li::marker{color:#789587}.clinical-orientation .orientation-list time{display:block;font-size:11px;color:#728278;margin-top:4px;white-space:nowrap}.clinical-orientation .orientation-list strong{font-weight:650}`}</style>
 </div>;
}
