'use client';
import Link from 'next/link';
import type {ClinicalCard,CardItem} from '@/lib/clinical/clinical-card';
import {clinicalCardPreview} from '@/lib/clinical/clinical-card';
import {formatClinicDateTime} from '@/lib/clinic-time';

// Whole sentences only: long records stay available behind an explicit disclosure.
export default function ClinicalCardView({card,patientId,compact=false}:{card:ClinicalCard;patientId:string;compact?:boolean}){
 function sourceLinks(items:CardItem[]){const ids=[...new Set(items.flatMap(i=>i.source_ids))];return ids.length>0&&<details className="clinical-card-sources"><summary>Πηγές</summary>{ids.map(id=>{const s=card.sources.find(s=>s.id===id);return s?<Link key={id} href={'/patients/demo/'+patientId+'?tab='+s.target+(s.session_id?'&session='+s.session_id:'')}>{s.label}</Link>:null})}</details>}
 function block(title:string,items:CardItem[],empty:string,budget:number){
  const {preview,rest}=clinicalCardPreview(items,budget);
  return <section className="clinical-card-section"><h3>{title}</h3>{preview.map((item,i)=><p key={i}>{item.text}</p>)}{!items.length&&<p className="clinical-card-empty">{empty}</p>}{rest.length>0&&<details className="clinical-card-details"><summary>{preview.length?'Περισσότερα':'Άνοιγμα καταγραφής'} · {rest.length}</summary>{rest.map((item,i)=><p key={i}>{item.text}</p>)}</details>}{!compact&&sourceLinks(items)}</section>;
 }
 return <div className={'clinical-card'+(compact?' clinical-card-compact':'')}>
  <p className="clinical-card-date">{card.date?'Τελευταία ολοκληρωμένη επίσκεψη · '+formatClinicDateTime(card.date):'Δεν υπάρχει ολοκληρωμένη επίσκεψη'}</p>
  {card.alerts.length>0&&<section className="clinical-card-attention" aria-label="Σημεία προσοχής"><strong>Χρειάζεται προσοχή</strong>{card.alerts.map(f=><details key={f.key}><summary>{f.label} · {f.text.split(/(?<=[.!?])\s/u)[0]}</summary><p>{f.text}</p>{sourceLinks([f])}</details>)}</section>}
  <div className="clinical-card-grid">
   {block('Διάγνωση',card.diagnoses,'Δεν έχει καταγραφεί δομημένη διάγνωση.',compact?18:30)}
   {block('Τρέχουσα αγωγή',card.medications,'Δεν υπάρχει καταχωρισμένη ενεργή αγωγή.',compact?18:30)}
  </div>
  {block('Ψυχική κατάσταση',compact?(card.changeLabels.length?[{text:'Καταγεγραμμένες αλλαγές: '+card.changeLabels.join(', ')+'.',source_ids:card.changes.flatMap(i=>i.source_ids)}]:[]):card.mse,compact?card.mse.length?'Χωρίς καταγεγραμμένη μεταβολή προς σύγκριση.':'Δεν υπάρχει MSE στην τελευταία επίσκεψη.':'Δεν υπάρχει καταγεγραμμένο MSE στην τελευταία ολοκληρωμένη επίσκεψη.',compact?15:45)}
  {!compact&&card.changeLabels.length>0&&<p className="clinical-card-change">Καταγεγραμμένες αλλαγές: {card.changeLabels.join(', ')}.</p>}
  {!compact&&card.changes.length>0&&<details className="clinical-card-details"><summary>Αλλαγές από την προηγούμενη επίσκεψη</summary>{card.changes.map((i,n)=><p key={n}>{i.text}</p>)}{sourceLinks(card.changes)}</details>}
  {block('Πορεία & επόμενο βήμα',card.notes,'Δεν υπάρχει διαθέσιμη καταγραφή πορείας ή πλάνου.',compact?30:65)}
  {!card.synthesized&&card.notes.length>0&&<small className="clinical-card-date">Καταγραφές γιατρού · η σύντομη σύνθεση δεν είναι διαθέσιμη.</small>}
  {!compact&&card.corrections.length>0&&<details className="clinical-card-details"><summary>Ιστορικό διορθώσεων · {card.corrections.length}</summary>{card.corrections.map(f=><p key={f.key}>{f.text}</p>)}{sourceLinks(card.corrections)}</details>}
  <style jsx global>{`.clinical-card{color:#293e35;background:#f8fbf8;border:1px solid #e2eae4;border-radius:18px;padding:24px;line-height:1.65}.clinical-card-date{margin:0 0 18px;color:#728278;font-size:11px}.clinical-card-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.clinical-card-section{padding:14px 0;border-top:1px solid #e4ebe5;min-width:0}.clinical-card-section h3{font-size:12px;font-weight:700;color:#667b6f;margin:0 0 8px}.clinical-card-section p,.clinical-card-details p{font-size:14px;line-height:1.7;margin:0 0 7px;white-space:pre-wrap;overflow-wrap:anywhere}.clinical-card-empty{color:#7d8982!important;font-size:12px!important}.clinical-card-sources{font-size:10px;color:#768b7e}.clinical-card-sources summary,.clinical-card-details summary{cursor:pointer}.clinical-card-sources a{display:block;color:#476b59;margin-top:5px}.clinical-card-change{font-size:12px;color:#55765f;margin:0 0 6px}.clinical-card-details{font-size:12px;color:#587562;margin:7px 0}.clinical-card-details p{color:#293e35;margin-top:10px}.clinical-card-attention{border-left:3px solid #b78a49;background:#fff8ea;border-radius:8px;padding:10px 13px;margin-bottom:17px;font-size:12px;color:#745424}.clinical-card-attention strong{display:block;margin-bottom:5px}.clinical-card-attention details{margin:5px 0}.clinical-card-attention summary{cursor:pointer}.clinical-card-compact{padding:15px;border-radius:13px}.clinical-card-compact .clinical-card-date{font-size:10px;margin-bottom:10px}.clinical-card-compact .clinical-card-grid{grid-template-columns:1fr;gap:0}.clinical-card-compact .clinical-card-section{padding:9px 0}.clinical-card-compact .clinical-card-section p{font-size:12px;line-height:1.55}.clinical-card-compact .clinical-card-section h3{font-size:10px;margin-bottom:4px}@media(max-width:700px){.clinical-card-grid{grid-template-columns:1fr;gap:0}.clinical-card{padding:18px}.clinical-card-compact{padding:13px}}`}</style>
 </div>;
}
