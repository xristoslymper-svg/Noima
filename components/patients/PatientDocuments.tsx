'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {Download,X} from 'lucide-react';
import {useCalendarDialog} from '@/components/calendar/useCalendarDialog';
import {useOptionLabel} from '@/i18n/option-labels';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {formatClinicDate} from '@/lib/clinic-time';
import {getDemoTesterId} from '@/lib/demo-tester';
import {instruments,answerLabels} from '@/lib/psychometrics/instruments';
import {questionnaireCalculation,historyAdditionExists} from '@/lib/documents/historical-scan';
import {documentCategories,historySectionKeys,maxDocumentBytes,maxScanDocuments,type HistoricalScan,type HistoricalScanReview,type HistorySectionKey,type PatientDocument} from '@/lib/documents/types';
import styles from './PatientDocuments.module.css';

type Action='document'|'scan'|null;
type Props={bundle:PatientBundle;reload:()=>Promise<unknown>;action:Action;onClose:()=>void};
type PickedFile={file:File;id:string;document?:PatientDocument};
const errorKeys={
 document_too_large:'patientDocuments.tooLarge',document_type:'patientDocuments.invalidType',document_malformed:'patientDocuments.malformed',document_active_content:'patientDocuments.activeContent',document_metadata:'patientDocuments.invalidFile',
 document_unavailable:'patientDocuments.unavailable',document_not_found:'patientDocuments.notFound',document_request_conflict:'patientDocuments.requestConflict',document_read_failed:'patientDocuments.readFailed',document_integrity_failed:'patientDocuments.integrityFailed',document_upload_failed:'patientDocuments.uploadFailed',
 scan_unavailable:'patientDocuments.scanUnavailable',scan_in_progress:'patientDocuments.scanInProgress',scan_stale_history:'patientDocuments.historyChanged',scan_request_conflict:'patientDocuments.requestConflict',scan_invalid_result:'patientDocuments.scanInvalid',scan_page_limit:'patientDocuments.scanPageLimit',scan_no_changes:'patientDocuments.noNewHistory',external_ai_disabled:'patientDocuments.scanUnavailable',
} as const;
const documentUrl=(patientId:string,id:string,download=false)=>'/api/patients/documents?patient_id='+encodeURIComponent(patientId)+'&id='+encodeURIComponent(id)+(download?'&download=1':'');

// Keep the component mounted when its interaction closes. Local files and reviewed
// values survive ESC/outside-close and failed uploads, scoped to this patient only.
export function PatientDocumentsSection(props:Props){return <PatientDocuments key={props.bundle.patient.id} {...props}/>}
export default PatientDocumentsSection;
function PatientDocuments({bundle,reload,action,onClose}:Props){
 const t=useTranslations(),locale=useLocale(),optionLabel=useOptionLabel();
 const [documents,setDocuments]=useState<PatientDocument[]>([]),[listError,setListError]=useState(''),[notice,setNotice]=useState('');
 const [files,setFiles]=useState<PickedFile[]>([]),[scanFiles,setScanFiles]=useState<PickedFile[]>([]);
 const [title,setTitle]=useState(''),[category,setCategory]=useState(''),[documentDate,setDocumentDate]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[scan,setScan]=useState<HistoricalScan|null>(null),[review,setReview]=useState<HistoricalScanReview|null>(null);
 const [answerDraft,setAnswerDraft]=useState<(number|null)[]|null>(null),[originalIndex,setOriginalIndex]=useState(0),[scanRequest,setScanRequest]=useState(''),[metadataLocked,setMetadataLocked]=useState(false);
 const [nativePdfViewer,setNativePdfViewer]=useState(false);
 const [historyDrafts,setHistoryDrafts]=useState<Partial<Record<HistorySectionKey,string>>>({});
 const fileInput=useRef<HTMLInputElement>(null),flight=useRef(false);
 const previousAction=useRef<Action>(null);
 const modal=useCalendarDialog(onClose,false,Boolean(action));
 const patientId=bundle.patient.id,patientName=[bundle.patient.first_name,bundle.patient.last_name].filter(Boolean).join(' ');
 const fields:Record<HistorySectionKey,string>={psychiatric_history:t('history.psychiatric'),medical_history:t('history.medical'),previous_treatments:t('history.previousTreatments'),hospitalizations:t('history.hospitalizations'),family_history:t('history.family'),substance_history:t('history.substances'),social_functioning:t('history.socialFunctioning'),allergies:t('history.allergies')};
 const categories:Record<string,string>={discharge:t('patientDocuments.discharge'),opinion:t('patientDocuments.opinion'),tests:t('patientDocuments.tests'),history:t('patientDocuments.oldHistory'),other:t('patientDocuments.other')};
 function errorText(code:string){return t(code in errorKeys?errorKeys[code as keyof typeof errorKeys]:'patientDocuments.failed')}
 async function jsonCall(url:string,body:Record<string,unknown>){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-noima-output-locale':locale},body:JSON.stringify({...body,tester:getDemoTesterId()})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.code||'document_failed');return data;
 }
 useEffect(()=>{
  let active=true;
  fetch('/api/patients/documents?patient_id='+encodeURIComponent(patientId),{cache:'no-store'}).then(async response=>{
   const data=await response.json();if(!response.ok)throw new Error(data.code||'document_failed');
   const rows=Array.isArray(data.documents)?data.documents as PatientDocument[]:[];
   if(rows.some(row=>row.patient_id!==patientId||row.tester_id!==getDemoTesterId()))throw new Error('document_integrity_failed');
   if(active)setDocuments(rows);
  }).catch(cause=>{if(active)setListError(cause instanceof Error?cause.message:'document_failed')});
  return()=>{active=false};
 },[patientId]);
 useEffect(()=>{if(action&&previousAction.current&&action!==previousAction.current)setError('');if(action)previousAction.current=action},[action]);
 useEffect(()=>{setNativePdfViewer(navigator.pdfViewerEnabled===true)},[]);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(files.length||scanFiles.length&&scan?.state!=='approved'){event.preventDefault();event.returnValue=''}};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[files.length,scanFiles.length,scan?.state]);
 function remember(document:PatientDocument){setDocuments(previous=>[document,...previous.filter(x=>x.id!==document.id)].sort((a,b)=>b.created_at.localeCompare(a.created_at)));setListError('')}
 async function upload(pick:PickedFile,mode:'document'|'scan'){
  if(pick.document)return pick.document;
  const data=new FormData();data.set('patient_id',patientId);data.set('request_id',pick.id);data.set('file',pick.file);
  if(mode==='document'){data.set('title',title);data.set('category',category);data.set('document_date',documentDate)}
  const response=await fetch('/api/patients/documents',{method:'POST',body:data});const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.code||'document_upload_failed');
  const document=result.document as PatientDocument;
  if(!document||document.id!==pick.id||document.patient_id!==patientId||document.tester_id!==getDemoTesterId()||document.byte_size!==pick.file.size||document.state!=='ready')throw new Error('document_integrity_failed');
  remember(document);
  const update=(rows:PickedFile[])=>rows.map(row=>row.id===pick.id?{...row,document}:row);
  (mode==='document'?setFiles:setScanFiles)(update);
  return document;
 }
 function selectedFiles(input:FileList|File[]|null,mode:'document'|'scan'){
  const picked=Array.from(input||[]);if(!picked.length||flight.current)return;
  if(picked.length>(mode==='scan'?maxScanDocuments:1)){setError('document_metadata');return}
  if(picked.some(file=>file.size>maxDocumentBytes)){setError('document_too_large');return}
  const previous=mode==='document'?files:scanFiles;
  const next=picked.map((file,index)=>{const old=previous[index];return old&&old.file.name===file.name&&old.file.size===file.size&&old.file.lastModified===file.lastModified?{...old,file}:{file,id:crypto.randomUUID()}});setError('');
  if(mode==='document'){setFiles(next);if(next[0]?.id!==files[0]?.id)setMetadataLocked(false)}
  else{const same=next.length===scanFiles.length&&next.every((file,index)=>file.id===scanFiles[index].id);const id=same&&scanRequest?scanRequest:crypto.randomUUID();setScanFiles(next);setScan(null);setReview(null);setAnswerDraft(null);setOriginalIndex(0);setScanRequest(id);void startScan(next,id)}
 }
 async function saveDocument(event:FormEvent){
  event.preventDefault();if(!files.length||flight.current)return;flight.current=true;setBusy(true);setError('');setMetadataLocked(true);
  try{await upload(files[0],'document');setFiles([]);setTitle('');setCategory('');setDocumentDate('');setMetadataLocked(false);setNotice(t('patientDocuments.saved'));onClose()}
  catch(cause){const code=cause instanceof Error?cause.message:'document_failed';setError(code);if(['document_type','document_malformed','document_active_content','document_metadata','document_too_large','document_not_found','document_unavailable'].includes(code))setMetadataLocked(false)}
  finally{flight.current=false;setBusy(false)}
 }
 async function startScan(picks=scanFiles,id=scanRequest){
  if(!picks.length||flight.current)return;flight.current=true;setBusy(true);setError('');
  try{
   // Independent files may arrive separately; failed/retried requests keep their
   // original stable IDs and can never replace an existing original.
   const uploaded:PatientDocument[]=[];
   for(const pick of picks)uploaded.push(await upload(pick,'scan'));
   const data=await jsonCall('/api/intake/scan',{mode:'historical',action:'parse',patient_id:patientId,request_id:id,document_ids:uploaded.map(x=>x.id)});
   const result=data.scan as HistoricalScan;
   if(!result||result.id!==id||result.patient_id!==patientId||result.tester_id!==getDemoTesterId()||JSON.stringify(result.document_ids)!==JSON.stringify(uploaded.map(x=>x.id)))throw new Error('document_integrity_failed');
   setScan(result);
   if(result.extracted){
    const value=result.extracted;setAnswerDraft(value.answers);setHistoryDrafts(Object.fromEntries(historySectionKeys.filter(key=>value.history[key]).map(key=>[key,value.history[key]!.text])));
    const calculation=questionnaireCalculation(value.kind,value.answers,value.reported_total);
    setReview({kind:value.kind,administered_on:value.administration_date,score:calculation.score,answers:calculation.complete?value.answers as number[]:null,note:'',
     additions:historySectionKeys.filter(key=>value.history[key]&&!bundle.history?.[key]?.trim()&&!value.history[key]?.needs_review).map(key=>({field:key,text:value.history[key]!.text,attribution:value.history[key]!.attribution})),
     expected_history_version:bundle.history?.version??0,patient_confirmed:!value.patient_identity_check});
   }
  }catch(cause){setError(cause instanceof Error?cause.message:'scan_failed')}
  finally{flight.current=false;setBusy(false)}
 }
 async function approveScan(event:FormEvent){
  event.preventDefault();if(!scan?.extracted||!review||flight.current)return;flight.current=true;setBusy(true);setError('');
  const calculated=questionnaireCalculation(review.kind,answerDraft,review.score);
  const body={...review,score:review.kind==='history'?null:calculated.score,answers:calculated.complete?answerDraft as number[]:null,additions:review.kind==='history'?review.additions.filter(item=>historyCandidates.includes(item.field)):[]};
  try{
   await jsonCall('/api/patients/documents/import',{patient_id:patientId,request_id:scan.id,approved:true,review:body});
   setScan({...scan,state:'approved'});setScanFiles([]);setScan(null);setReview(null);setScanRequest('');setAnswerDraft(null);setNotice(t('patientDocuments.imported'));onClose();
   try{await reload()}catch{/* the approved write is committed; a later folder refresh can reconcile */}
  }catch(cause){
   const code=cause instanceof Error?cause.message:'scan_failed';setError(code);
   if(code==='scan_stale_history')try{await reload()}catch{/* keep all local review values for an explicit retry */}
  }finally{flight.current=false;setBusy(false)}
 }
 const calculation=review?questionnaireCalculation(review.kind,answerDraft,review.score):null;
 const historyCandidates=historySectionKeys.filter(key=>scan?.extracted?.history[key]&&!historyAdditionExists(bundle.history?.[key]||'',scan.extracted.history[key]!.text));
 const mismatch=scan?.extracted?questionnaireCalculation(scan.extracted.kind,answerDraft,scan.extracted.reported_total).discrepancy:false;
 const original=scanFiles[originalIndex]?.document;
 const originalPreview=Boolean(original&&(original.media_type!=='application/pdf'||nativePdfViewer));
 const uncertainIndices=scan?.extracted?.answers?.flatMap((value,index)=>value===null?[index]:[])||[];
 const selected=action==='document'?files:scanFiles;
 function answerInput(index:number){
  if(!review||review.kind!=='PHQ-9'&&review.kind!=='GAD-7')return null;
  return <label className={styles.answer} key={index}><span>{index+1}. {optionLabel(instruments[review.kind].items[index])}</span><select value={answerDraft?.[index]??''} disabled={busy} aria-label={t('patientDocuments.answerNumber',{number:index+1})} onChange={event=>setAnswerDraft(values=>(values||[]).map((value,key)=>key===index?(event.target.value===''?null:Number(event.target.value)):value))}>
   <option value="">{t('patientDocuments.needsReview')}</option>{answerLabels.map((label,value)=><option value={value} key={value}>{value} · {optionLabel(label)}</option>)}
  </select></label>;
 }
 return <section className={styles.section} aria-labelledby="patient-documents-heading">
  <h3 id="patient-documents-heading">{t('patientDocuments.title')}</h3>
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {listError?<p className={styles.muted} role="status">{errorText(listError)}</p>:documents.length?<ul className={styles.list}>{documents.map(document=><li key={document.id}>
   <div><a href={documentUrl(patientId,document.id)} target="_blank" rel="noreferrer">{document.title||document.original_name}</a><small>{[document.category?categories[document.category]:'',document.document_date?formatClinicDate(document.document_date,locale):''].filter(Boolean).join(' · ')}</small></div>
   <a href={documentUrl(patientId,document.id,true)} className={styles.download} aria-label={t('patientDocuments.downloadFile',{name:document.title||document.original_name})}><Download size={16}/></a>
  </li>)}</ul>:<p className={styles.muted}>{t('patientDocuments.empty')}</p>}
  {action&&<div className={styles.backdrop} onClick={event=>{if(event.target===event.currentTarget)onClose()}}>
   <section ref={modal} className={`${styles.dialog} ${action==='scan'&&scan?.extracted&&originalPreview?styles.wide:''}`} role="dialog" aria-modal="true" aria-labelledby="patient-document-dialog-title" tabIndex={-1}>
    <header className={styles.header}><div><h2 id="patient-document-dialog-title">{action==='document'?t('patientDocuments.document'):t('patientDocuments.scan')}</h2><small>{patientName}</small></div><button type="button" className={styles.close} onClick={onClose} aria-label={t('common.close')}><X size={19}/></button></header>
    {action==='document'||!scan?.extracted?<form onSubmit={event=>action==='document'?void saveDocument(event):(event.preventDefault(),void startScan())}>
     <div className={styles.drop} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(!busy)selectedFiles(event.dataTransfer.files,action)}}>
      <input ref={fileInput} type="file" className={styles.fileInput} tabIndex={-1} aria-hidden="true" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple={action==='scan'} disabled={busy} onChange={event=>{selectedFiles(event.target.files,action);event.currentTarget.value=''}}/>
      <button className={styles.choose} type="button" disabled={busy} onClick={()=>fileInput.current?.click()}>{selected.length?t('patientDocuments.changeFile'):t('patientDocuments.chooseFile')}</button>
      <small>{t('patientDocuments.fileTypes')}</small>
     </div>
     {selected.length>0&&<ul className={styles.selectedFiles}>{selected.map(file=><li key={file.id}><span>{file.file.name}</span>{file.document&&<small>{t('common.saved')}</small>}</li>)}</ul>}
     {action==='document'&&<details className={styles.metadata}><summary>{t('patientDocuments.details')}</summary><div className={styles.metadataFields}>
      <label>{t('patientDocuments.label')}<input maxLength={200} value={title} disabled={busy||metadataLocked} onChange={event=>setTitle(event.target.value)}/></label>
      <label>{t('patientDocuments.category')}<select value={category} disabled={busy||metadataLocked} onChange={event=>setCategory(event.target.value)}><option value="">—</option>{documentCategories.map(key=><option key={key} value={key}>{categories[key]}</option>)}</select></label>
      <label>{t('patientDocuments.documentDate')}<input type="date" value={documentDate} disabled={busy||metadataLocked} onChange={event=>setDocumentDate(event.target.value)}/></label>
     </div></details>}
     {busy&&<p className={styles.muted} role="status">{action==='scan'?t('patientDocuments.reading'):t('common.saving')}</p>}
     {error&&<p className={styles.error} role="alert">{errorText(error)}</p>}
     <footer className={styles.footer}>{action==='document'?<button className={styles.primary} type="submit" disabled={busy||!files.length}>{busy?t('common.saving'):t('common.save')}</button>:scanFiles.length>0&&!busy?<button className={styles.primary} type="submit">{t('common.retry')}</button>:null}</footer>
    </form>:<form onSubmit={event=>void approveScan(event)}>
     <div className={`${styles.reviewLayout} ${originalPreview?'':styles.compactReview}`}>
      <div className={styles.result}>
       <h3>{scan.extracted.kind==='history'?t('patientDocuments.oldHistory'):scan.extracted.kind==='unknown'?t('patientDocuments.unknownDocument'):scan.extracted.kind}</h3>
       {scan.extracted.patient_identity_check&&review&&<div className={styles.identityCheck}><p>{t('patientDocuments.documentPatient',{name:scan.extracted.patient_name||''})}</p><label><input type="checkbox" checked={review.patient_confirmed} disabled={busy} onChange={event=>setReview({...review,patient_confirmed:event.target.checked})}/>{t('patientDocuments.confirmPatient',{name:patientName})}</label></div>}
       {review&&(review.kind==='PHQ-9'||review.kind==='GAD-7')&&<>
        <div className={styles.scoreFields}><label>{t('patientDocuments.score')}<input required type="number" min={0} max={review.kind==='PHQ-9'?27:21} step={1} disabled={busy} readOnly={calculation?.complete} value={calculation?.computed??review.score??''} onChange={event=>setReview({...review,score:event.target.value===''?null:Number(event.target.value)})}/></label>
         <label>{t('patientDocuments.examDate')}<input required type="date" max={bundle.clinical_day} disabled={busy} value={review.administered_on||''} onChange={event=>setReview({...review,administered_on:event.target.value||null})}/></label></div>
        {!calculation?.complete&&<small className={styles.muted}>{t('patientDocuments.totalOnly')}</small>}
        {mismatch&&<p className={styles.reviewFlag} role="status">{t('patientDocuments.scoreMismatch',{reported:scan.extracted.reported_total??0,computed:calculation?.computed??0})}</p>}
        {uncertainIndices.length>0&&<div className={styles.uncertainAnswers}><small className={styles.reviewFlag}>{t('patientDocuments.needsReview')}</small>{uncertainIndices.map(answerInput)}</div>}
        {answerDraft&&<details className={styles.answers}><summary>{t('patientDocuments.answers')}</summary>{answerDraft.map((_,index)=>uncertainIndices.includes(index)?null:answerInput(index))}</details>}
        <details className={styles.metadata}><summary>{t('patientDocuments.note')}</summary><textarea rows={2} maxLength={2000} value={review.note} disabled={busy} onChange={event=>setReview({...review,note:event.target.value})}/></details>
       </>}
       {review?.kind==='history'&&<div className={styles.historyAdditions}>{!historyCandidates.length&&<p className={styles.muted}>{t('patientDocuments.noNewHistory')}</p>}{historyCandidates.map(key=>{
        const value=scan.extracted!.history[key]!,included=review.additions.find(item=>item.field===key),current=bundle.history?.[key]?.trim();
        return <div className={styles.historyAddition} key={key}>
         <label className={styles.historyChoice}><input type="checkbox" disabled={busy} checked={Boolean(included)} onChange={event=>setReview({...review,additions:event.target.checked?[...review.additions,{field:key,text:historyDrafts[key]??value.text,attribution:value.attribution}]:review.additions.filter(item=>item.field!==key)})}/><strong>{fields[key]}</strong>{(value.needs_review||current)&&<small>{t('patientDocuments.needsReview')}</small>}</label>
         <p>{historyDrafts[key]??value.text}</p><small className={styles.muted}>{value.attribution==='patient_reported'?t('patientDocuments.patientReported'):t('patientDocuments.fromDocument')}</small>
         <details className={styles.historyDetails}><summary>{current?t('patientDocuments.existingAndEdit'):t('patientDocuments.editText')}</summary>
          {current&&<div className={styles.existingHistory}><small>{t('patientDocuments.alreadyRecorded')}</small><p>{current}</p></div>}
          <textarea rows={3} maxLength={4000} aria-label={fields[key]} disabled={busy} value={historyDrafts[key]??value.text} onChange={event=>{setHistoryDrafts({...historyDrafts,[key]:event.target.value});setReview({...review,additions:review.additions.map(item=>item.field===key?{...item,text:event.target.value}:item)})}}/>
         </details>
        </div>;
       })}</div>}
       {scan.extracted.kind==='unknown'&&<p className={styles.muted}>{t('patientDocuments.unsupportedScan')}</p>}
       {scan.extracted.uncertainties.length>0&&<details className={styles.metadata}><summary>{t('patientDocuments.reviewNotes')}</summary><ul>{scan.extracted.uncertainties.map((issue,index)=><li key={index}>{issue.issue}</li>)}</ul></details>}
      </div>
      {original&&<aside className={styles.original}><div className={styles.originalHeader}><strong>{t('patientDocuments.original')}</strong><a href={documentUrl(patientId,original.id)} target="_blank" rel="noreferrer">{t('patientDocuments.openOriginal')}</a></div>
       {scanFiles.length>1&&<nav className={styles.pages} aria-label={t('patientDocuments.originals')}>{scanFiles.map((file,index)=><button type="button" key={file.id} className={index===originalIndex?styles.pageActive:''} aria-pressed={index===originalIndex} onClick={()=>setOriginalIndex(index)}>{index+1}</button>)}</nav>}
       {original.media_type==='application/pdf'?(nativePdfViewer?<iframe title={t('patientDocuments.original')} src={documentUrl(patientId,original.id)} sandbox=""/>:<p className={styles.originalFile}><a href={documentUrl(patientId,original.id,true)}>{original.title||original.original_name}</a></p>):<img src={documentUrl(patientId,original.id)} alt={t('patientDocuments.original')}/>}
      </aside>}
     </div>
     {error&&<p className={styles.error} role="alert">{errorText(error)}{error==='scan_stale_history'&&review&&<button type="button" className={styles.quiet} onClick={()=>{setReview({...review,expected_history_version:bundle.history?.version??0,additions:[]});setError('')}}>{t('patientDocuments.reviewUpdatedHistory')}</button>}</p>}
     <footer className={styles.footer}>
      <button type="button" className={styles.quiet} disabled={busy} onClick={()=>{setScan(null);setScanFiles([]);setReview(null);setAnswerDraft(null);setScanRequest('');setError('')}}>{t('patientDocuments.anotherForm')}</button>
      {review?.kind==='unknown'||review?.kind==='history'&&!historyCandidates.length?<button type="button" className={styles.primary} onClick={onClose}>{t('common.close')}</button>:<button type="submit" className={styles.primary} disabled={busy||!review?.patient_confirmed||review.kind==='history'&&!review.additions.length}>{busy?t('common.saving'):t('patientDocuments.approveSave')}</button>}
     </footer>
    </form>}
   </section>
  </div>}
 </section>;
}
