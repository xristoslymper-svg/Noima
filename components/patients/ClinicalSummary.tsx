'use client';
import {useSyntheticChart} from './SyntheticChartContext';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {getDemoTesterId} from '@/lib/demo-tester';
import {requestClinicalSummary,clinicalSummaryRetryDelayMs,CLINICAL_SUMMARY_RETRY_DELAY_MS} from '@/lib/clinical/summary-request';
import {buildClinicalCard,type ClinicalCard} from '@/lib/clinical/clinical-card';
import {buildSummaryContext,summaryContextKey,clinicDay} from '@/lib/clinical/summary-context';
import ClinicalCardView from './ClinicalCardView';
type Props={bundle:PatientBundle;compact?:boolean;overview?:boolean;onSessions:(id?:string)=>void;onPsychometrics:()=>void;onMedications:()=>void;onHistory:()=>void};
type Result={card:ClinicalCard;mode:string;context_hash:string;reason?:string|null};
export default function ClinicalSummary({bundle,compact=false,overview=false}:Props){
 const synthetic=useSyntheticChart();
 const [retry,setRetry]=useState(0),[refresh,setRefresh]=useState(0);
 const handledRefresh=useRef(0);
 const retryAfter=useRef<{key:string;at:number}|null>(null);
 const [result,setResult]=useState<{key:string;data:Result}|null>(null);
 const [state,setState]=useState<'loading'|'ready'|'unavailable'>('loading');
 const key=summaryContextKey(bundle,clinicDay());
 useEffect(()=>{const focus=()=>setRetry(n=>n+1);window.addEventListener('focus',focus);const timer=setInterval(focus,60000);return(¶»§q«^