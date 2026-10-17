import {errorJson} from '@/i18n/errors';
import {withPilot} from '@/lib/pilot/route';
import {rpc} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {maxDocumentBytes} from '@/lib/documents/types';
import {documentMetadata,DocumentValidationError} from '@/lib/documents/validation';
import {readPatientDocument,uploadPatientDocument} from '@/lib/documents/server';

export const runtime='nodejs';export const dynamic='force-dynamic';
function failure(error:unknown){
 const code=error instanceof Error?error.message:'document_failed';
 if(error instanceof DocumentValidationError)return errorJson({error:'Μη έγκυρο έγγραφο.',code},{status:code==='document_too_large'?413:422});
 if(/Could not find the function|does not exist|PGRST202/.test(code))return errorJson({error:'Η αποθήκευση εγγράφων δεν έχει ενεργοποιηθεί.',code:'document_unavailable'},{status:503});
 if(/document_not_found|patient_not_found|pilot_not_authorized/.test(code))return errorJson({error:'Το έγγραφο δεν είναι διαθέσιμο.',code:'document_not_found'},{status:404});
 if(code==='document_request_conflict')return errorJson({error:'Η καταχώριση έχει ήδη χρησιμοποιηθεί για άλλο έγγραφο.',code},{status:409});
 return errorJson({error:'Το έγγραφο δεν αποθηκεύτηκε. Δοκιμάστε ξανά.',code:code.startsWith('document_')?code:'document_failed'},{status:400});
}
async function get(request:Request){
 const url=new URL(request.url),tester=url.searchParams.get('tester')||'',patient=url.searchParams.get('patient_id')||'',id=url.searchParams.get('id');
 if(!isClinicalId(tester)||!isClinicalId(patient)||id&&!isClinicalId(id))return errorJson({error:'Μη έγκυρος ασθενής.',code:'document_metadata'},{status:400});
 try{
  if(!id)return Response.json({documents:await rpc('demo_document_list',{p_tester:tester,p_patient:patient})});
  const download=url.searchParams.get('download')==='1';
  const {document,bytes}=await readPatientDocument(tester,patient,id,download?'download':'preview');
  const fallback=document.original_name.replace(/[^a-zA-Z0-9_.-]/g,'_');
  return new Response(bytes,{headers:{
   'Content-Type':document.media_type,'Content-Length':String(bytes.length),
   'Content-Disposition':`${download?'attachment':'inline'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(document.original_name)}`,
   'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
   'Content-Security-Policy':"default-src 'none'; sandbox; frame-ancestors 'self'",
  }});
 }catch(error){return failure(error)}
}
async function post(request:Request){
 const tester=new URL(request.url).searchParams.get('tester')||'';
 if(!isClinicalId(tester))return errorJson({error:'Συνδεθείτε για να συνεχίσετε.',code:'unauthenticated'},{status:401});
 const length=Number(request.headers.get('content-length')||0);
 if(length>maxDocumentBytes+64*1024)return errorJson({error:'Το έγγραφο είναι πολύ μεγάλο.',code:'document_too_large'},{status:413});
 try{
  const form=await request.formData();const patient=String(form.get('patient_id')||''),id=String(form.get('request_id')||''),file=form.get('file');
  if(!isClinicalId(patient)||!isClinicalId(id)||!(file instanceof File)||form.getAll('file').length!==1)return errorJson({error:'Μη έγκυρο έγγραφο.',code:'document_metadata'},{status:400});
  if(file.size>maxDocumentBytes)return errorJson({error:'Το έγγραφο είναι πολύ μεγάλο.',code:'document_too_large'},{status:413});
  const meta=documentMetadata({title:form.get('title'),category:form.get('category'),document_date:form.get('document_date')});
  return Response.json({document:await uploadPatientDocument(tester,patient,id,file,meta)});
 }catch(error){return failure(error)}
}
export const GET=withPilot(get);
export const POST=withPilot(post);
