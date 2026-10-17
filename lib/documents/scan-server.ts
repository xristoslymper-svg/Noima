import {randomUUID} from 'node:crypto';
import {errorJson} from '@/i18n/errors';
import {rpc,request as databaseRequest} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {pilotScope} from '@/lib/pilot/request-scope';
import {readPatientDocument} from './server';
import {historicalScanPrompt,historicalScanSchema,normalizeHistoricalScan} from './historical-scan';
import {maxScanDocuments,type HistoricalScan} from './types';

const one=<T>(data:unknown):T=>(Array.isArray(data)?data[0]:data) as T;
export function historicalScanFailure(error:unknown){
 const message=error instanceof Error?error.message:'';
 const code=/stale_history/.test(message)?'scan_stale_history':/history_no_changes/.test(message)?'scan_no_changes':/scan_request_conflict/.test(message)?'scan_request_conflict':/document_not_found|patient_not_found|pilot_not_authorized|scan_not_found/.test(message)?'document_not_found':/Could not find the function|does not exist|PGRST202/.test(message)?'document_unavailable':/scan_page_limit/.test(message)?'scan_page_limit':/invalid_scan|malformed|document_type|active_content/.test(message)?'scan_invalid_result':'scan_failed';
 return errorJson({error:'Η εισαγωγή δεν ολοκληρώθηκε.',code},{status:code==='document_unavailable'?503:code==='scan_stale_history'||code==='scan_request_conflict'?409:code==='document_not_found'?404:422});
}
export async function parseHistoricalScan(body:Record<string,unknown>,tester:string){
 const patient=String(body.patient_id||''),id=String(body.request_id||'');
 const documents=body.document_ids;
 if(body.action!=='parse'||!isClinicalId(patient)||!isClinicalId(id)||!Array.isArray(documents)||!documents.length||documents.length>maxScanDocuments||documents.some(x=>typeof x!=='string'||!isClinicalId(x))||new Set(documents).size!==documents.length)
  return errorJson({error:'Μη έγκυρο έγγραφο.',code:'document_metadata'},{status:400});
 if(!process.env.OPENAI_API_KEY)return errorJson({error:'Η αναγνώριση εντύπου δεν είναι διαθέσιμη.',code:'scan_unavailable'},{status:503});
 const attempt=randomUUID();let acquired=false;
 try{
  const start=await rpc('demo_document_scan_start',{p_tester:tester,p_patient:patient,p_request:id,p_documents:documents,p_attempt:attempt}) as {scan:HistoricalScan;acquired:boolean};
  if(start.scan.state==='ready'||start.scan.state==='approved')return Response.json({scan:start.scan});
  if(!start.acquired)return errorJson({error:'Η αναγνώριση βρίσκεται σε εξέλιξη.',code:'scan_in_progress'},{status:409});
  acquired=true;
  const originals=await Promise.all(documents.map(id=>readPatientDocument(tester,patient,id as string,'scan')));
  if(originals.reduce((count,original)=>count+original.pages,0)>40)throw new Error('scan_page_limit');
  const patients=await databaseRequest(`demo_patients?select=first_name,last_name&id=eq.${encodeURIComponent(patient)}&tester_id=eq.${encodeURIComponent(tester)}&limit=1`) as {first_name:string;last_name:string}[];
  if(!patients[0])throw new Error('patient_not_found');
  const language=pilotScope.getStore()?.outputLocale==='en'?'English':'Greek';
  const content:Record<string,unknown>[]=[{type:'input_text',text:historicalScanPrompt+' Write short uncertainty notes in '+language+'. Preserve the document wording in extracted clinical statements. If the order of an otherwise readable date is ambiguous, return null and flag it for review.'},...originals.map(({document,bytes})=>document.media_type==='application/pdf'
   ?{type:'input_file',filename:document.original_name,file_data:'data:application/pdf;base64,'+Buffer.from(bytes).toString('base64'),detail:'high'}
   :{type:'input_image',image_url:`data:${document.media_type};base64,`+Buffer.from(bytes).toString('base64'),detail:'high'})];
  const model=process.env.OPENAI_SCAN_MODEL||'gpt-5.6-luna';
  const response=await fetch((process.env.OPENAI_BASE_URL||'https://api.openai.com/v1')+'/responses',{method:'POST',signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,max_output_tokens:6000,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'noima_historical_document_scan',strict:true,schema:historicalScanSchema}}})});
  if(!response.ok){console.error('historical_scan_provider_failed',{status:response.status,model});throw new Error('scan_provider_failed')}
  const output=await response.json() as {status?:string;output?:{content?:{type:string;text?:string}[]}[]};
  if(output.status&&output.status!=='completed')throw new Error('scan_incomplete');
  const raw=output.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
  if(!raw)throw new Error('scan_empty');
  const extracted=normalizeHistoricalScan(JSON.parse(raw),[patients[0].first_name,patients[0].last_name].filter(Boolean).join(' '));
  const scan=one<HistoricalScan>(await rpc('demo_document_scan_finish',{p_tester:tester,p_patient:patient,p_request:id,p_attempt:attempt,p_extracted:extracted}));
  return Response.json({scan},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){
  if(acquired)try{await rpc('demo_document_scan_finish',{p_tester:tester,p_patient:patient,p_request:id,p_attempt:attempt,p_extracted:null})}catch{/* a newer attempt or committed result must stay intact */}
  return historicalScanFailure(error);
 }
}
