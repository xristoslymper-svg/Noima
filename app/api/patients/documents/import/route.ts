import {errorJson} from '@/i18n/errors';
import {withPilot} from '@/lib/pilot/route';
import {rpc} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {queueSummary} from '@/lib/clinical/queue-summary';
import {validateScanReview} from '@/lib/documents/historical-scan';
import {historicalScanFailure} from '@/lib/documents/scan-server';
import type {HistoricalScan} from '@/lib/documents/types';

export const runtime='nodejs';export const dynamic='force-dynamic';
async function post(request:Request){
 const body=await request.json().catch(()=>({})),tester=String(body.tester||''),patient=String(body.patient_id||''),id=String(body.request_id||'');
 if(!isClinicalId(tester)||!isClinicalId(patient)||!isClinicalId(id)||body.approved!==true)return errorJson({error:'Απαιτείται έλεγχος της καταχώρισης.',code:'scan_approval_required'},{status:400});
 try{
  const data=await rpc('demo_document_scan_get',{p_tester:tester,p_patient:patient,p_request:id});
  const scan=(Array.isArray(data)?data[0]:data) as HistoricalScan;
  if(!scan?.extracted||!['ready','approved'].includes(scan.state))throw new Error('invalid_scan_review');
  const review=validateScanReview(body.review,scan.extracted);
  const result=await rpc('demo_document_scan_commit',{p_tester:tester,p_patient:patient,p_request:id,p_review:review});
  // Only approved information invalidates/prepares the existing clinical summary.
  // Attachment uploads and unreviewed extraction do not invoke the summary model.
  queueSummary(request,patient);
  return Response.json(result);
 }catch(error){return historicalScanFailure(error)}
}
export const POST=withPilot(post);
