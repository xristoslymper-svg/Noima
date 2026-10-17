import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {rpc} from '@/lib/patients/demo-runtime';
import {pilotScope} from '@/lib/pilot/request-scope';
import {supabaseUrl,supabaseKey} from '@/lib/pilot/config';
import {documentBucket,type PatientDocument} from './types';
import {documentMetadata,safeDocumentName,validateDocumentBytes} from './validation';
import {validateDocumentStructure} from './structure-validation';

const one=<T>(data:unknown):T=>(Array.isArray(data)?data[0]:data) as T;
function storage(){
 const token=pilotScope.getStore()?.token;if(!token)throw new Error('unauthenticated');
 return createClient(supabaseUrl,supabaseKey,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}).storage.from(documentBucket);
}
export const documentHash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export async function uploadPatientDocument(tester:string,patient:string,id:string,file:File,meta:ReturnType<typeof documentMetadata>){
 const bytes=new Uint8Array(await file.arrayBuffer());
 const mediaType=validateDocumentBytes(bytes,file.type,file.name);
 await validateDocumentStructure(bytes,mediaType);
 const document=one<PatientDocument>(await rpc('demo_document_stage',{p_tester:tester,p_patient:patient,p_id:id,p_meta:{...meta,original_name:safeDocumentName(file.name),media_type:mediaType,byte_size:bytes.length,sha256:documentHash(bytes)}}));
 if(document.state==='ready')return document;
 const bucket=storage();
 const {error}=await bucket.upload(document.object_name,bytes,{contentType:mediaType,cacheControl:'0',upsert:false});
 if(error){
  // The first request may have uploaded before its HTTP response was lost.
  // Read and verify an existing object; never replace it during a retry.
  const {data:existing,error:readError}=await bucket.download(document.object_name);
  if(readError||!existing)throw new Error('document_upload_failed');
  const existingBytes=new Uint8Array(await existing.arrayBuffer());
  if(documentHash(existingBytes)!==document.sha256||existingBytes.length!==document.byte_size)throw new Error('document_request_conflict');
  validateDocumentBytes(existingBytes,document.media_type,document.original_name);
 }
 return one<PatientDocument>(await rpc('demo_document_complete',{p_tester:tester,p_patient:patient,p_id:id}));
}
export async function readPatientDocument(tester:string,patient:string,id:string,action:'preview'|'download'|'scan'){
 const document=one<PatientDocument>(await rpc('demo_document_get',{p_tester:tester,p_patient:patient,p_id:id,p_action:action}));
 const {data,error}=await storage().download(document.object_name);
 if(error||!data)throw new Error('document_read_failed');
 const bytes=new Uint8Array(await data.arrayBuffer());
 if(bytes.length!==document.byte_size||documentHash(bytes)!==document.sha256)throw new Error('document_integrity_failed');
 validateDocumentBytes(bytes,document.media_type,document.original_name);
 const structure=await validateDocumentStructure(bytes,document.media_type);
 return {document,bytes,pages:structure.pages};
}
