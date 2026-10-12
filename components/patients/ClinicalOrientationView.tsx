'use client';
import Link from 'next/link';
import type {ClinicalCard,CardItem} from '@/lib/clinical/clinical-card';
import {formatClinicDateTime} from '@/lib/clinic-time';

export default function ClinicalOrientationView({card,patientId}:{card:ClinicalCard;patientId:string}){
 function sources(items:CardItem[]){
  const evidence=card.sources.filter(s=>items.some(i=>i.source_ids.includes(s.id)));
  return evidence.length>0&&<details className="orientation-sources"><summary>Πηγές</summary>{evidence.map(s=>{
   const tab=s.target;
   return <Link key={s.id} href={'/patients/demo/'+encodeURIComponent(patientId)+'?tab='+tab+(s.session_id?'&session='+encodeURIComponent(s.session_id):'')}>{s.label}</Link>;
  })}</details>;
 }
 return <div className="clinical-orientation">
  <p className="orientation-date">{card.date?'Τελευταία ολοκληρωμένη επίσκεψη · '+formatClinicDateTime(card.date):'Δεν υπάρχει ολοκληρωμένη επίσκεψη'}</p>
  {card.alerts.length>0&&<section className="orientation-attention" aria-label="Σημεία προσοχής"><strong>Χρειάζεται προσοχή</strong>{card.alerts.map(f=><div key={f.key}><p>{f.text}</p>{sources([f])}</div>)}</section>}
  <dl>{card.orientation?.map(row=><div className="orientation-row" key={row.label}><dt>{row.label}</dt><dd>{row.items.length?row.items.map((item,i)=><p key={i}>{item.text}</p>):<p className="orientation-empty">{row.empty}</p>}{sources(row.items)}{Boolean(row.history?.length)&&<details className="orientation-history"><summary>{row.label==='Επόμενη επανεκτίμηση'?'Παλαιότερα καταγεγραμμένα πλάνα · ιστορικό, όχι επιβεβαιωμένες εκκρεμότητες':'Παλαιότερες καταγραφές'} ({row.history!.length})</summary>{row.history!.map((item,i)=><p key={i}>{item.text}</p>)}{sources(row.history!)}</details>}</dd></div>)}</dl>
  {card.corrections.length>0&&<details className="orientation-history"><summary>Καταγεγραμμένες διορθώσεις ({card.corrections.length})</summary>{card.corrections.map(f=><p key={f.key}>{f.text}</p>)}{sources(card.corrections)}</details>}
  <style jsx>{`.clinical-orientation{color:#293e35;line-height:1.65}.orientation-date{font-size:12px;color:#728278;margin:0 0 18px}.clinical-orientation dl{margin:0}.orientation-row{display:grid;grid-template-columns:210px minmax(0,1fr);gap:25px;padding:20px 0;border-top:1px solid #dfe8e1}.orientation-row dt{font-size:14px;font-weight:650;color:#50745e}.orientation-row dd{margin:0;min-width:0}.clinical-orientation p{margin:0 0 9px;white-space:pre-wrap;overflow-wrap:anywhere}.orientation-row p{font-size:14px}.orientation-empty{color:#728278;font-size:13px!important}.orientation-history{margin-top:10px;font-size:12px;color:#667b6f}.orientation-history summary,.orientation-sources summary{cursor:pointer}.orientation-history p{margin-top:12px;color:#293e35}.orientation-sources{font-size:11px;color:#728278}.orientation-attention{border-left:3px solid #b78a49;padding:10px 15px;background:#fff8ea;margin-bottom:18px;font-size:13px}@media(max-width:700px){.orientation-row{grid-template-columns:1fr;gap:9px;padding:16px 0}}`}</style>
  <style jsx global>{`.orientation-sources a{display:block;color:#50745e;font-size:11px;margin-top:4px}`}</style>
 </div>;
}
