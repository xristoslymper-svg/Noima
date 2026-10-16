'use client';
import Link from 'next/link';
import PrevisitBriefingView from './PrevisitBriefingView';
import ClinicalOrientationView from './ClinicalOrientationView';
import type {ClinicalCard,CardItem} from '@/lib/clinical/clinical-card';
import {clinicalCardPreview} from '@/lib/clinical/clinical-card';
import {formatClinicDateTime} from '@/lib/clinic-time';
import {overviewAttention} from '@/lib/overview/attention';

// Whole sentences only: long records stay available behind an explicit disclosure.
export default function ClinicalCardView({card,patientId,compact=false,overview=false}:{card:ClinicalCard;patientId:string;compact?:boolean;overview?:boolean}){
 if((overview||compact)&&card.briefing)return <PrevisitBriefingView card={card} brief={card.briefing} patientId={patientId}/>;
 if(card.orientation&&!overview&&!compact)return <ClinicalOrientationView card={card} patientId={patientId}/>;
 const comparison=clinicalCardPreview(card.changeSummary,compact?35:60);
 const attention=overview?overviewAttention(card):null;
 function attentionGroup(title:string,items:ClinicalCard['alerts'],secondary=false){
  return items.length>0&&<section className="clinical-card-attention" style={secondary?{background:'transparent',borderLeftColor:'#8b9d8e',color:'#435c4d'}:undefined} aria-label={title}><strong>{title}</strong>{items.map(f=><div key={f.key}><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{f.text}</p>{sourceLinks([f])}</div>)}</section>;
 }
 function sourceLinks(item¶»§q«^