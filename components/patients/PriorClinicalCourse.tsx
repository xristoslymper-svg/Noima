'use client';
import {useEffect,useRef,useState} from 'react';
import {Mic,Square,X,Check} from 'lucide-react';
import {getDemoTesterId} from '@/lib/demo-tester';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import styles from './PriorClinicalCourse.module.css';

export default function PriorClinicalCourse({bundle,reload,onClose}:{bundle:PatientBundle;reload:()=>Promise<unknown>;onClose:()=>void}){
 const initial=bundle.priorCourse;
 const [content,setContent]=useState(initial?.content||'');
 const [period,setPeriod]=useState(initial?.period_label||'');
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[recording,setRecording]=useState(false),[transcribing,setTranscribing]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null);
 const busy=useRef(false);
 useEffect(()=>{const onLeave=(e:BeforeUnloadEvent)=>{if(content!==(initial?.content||'')||period!==(initial?.period_label||'')){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',onLeave);return()=>window.removeEventListener('beforeunload',onLeave)},[content,period,initial]);
 useEffect(()=>()=>{recorder.current?.stop();stream.current?.getTracks().forEach(t=>t.stop())},[]);
 async function save(){
  if(busy.current)return;busy.current=true;setSaving(true);setError('');
  try{const response=await fetch('/api/patients/demo/prior-course',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringif¶»§q«^