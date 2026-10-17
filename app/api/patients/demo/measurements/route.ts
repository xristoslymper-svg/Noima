import {withPilot} from '@/lib/pilot/route';
import {rpc} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {historicalMeasurementProjection,historicalMeasurementsUnavailable,validAdministrationDate,validHistoricalScore,type HistoricalMeasurement} from '@/lib/clinical/historical-measurements';
import {queueSummary} from '@/lib/clinical/queue-summary';
export const dynamic='force-dynamic';
export const preferredRegion='fra1';

function failure(error:unknown){
 if(historicalMeasurementsUnavailable(error))return Response.json({code:'measurement_unavailable'},{status:503});
 const message=error instanceof Error?error.message:'';
 if(/patient_not_found|document_not_found/.test(message))return Response.json({code:'not_found'},{status:404});
 if(/stale_measurement|measurement_request_conflict/.test(message))return Response.json({code:'measurement_conflict'},{status:409});
 if(/invalid_|total_only_measurement/.test(message))return Response.json({code:'invalid_measurement'},{status:422});
 if(/pilot_not_authorized|authentication_required/.test(message))return Response.json({code:'unauthorized'},{status:403});
 return Response.json({code:'measurement_save_failed'},{status:503});
}
async function get(request:Request){
 const query=new URL(request.url).searchParams,tester=query.get('tester'),patient=query.get('patient_id');
 if(!isClinicalId(tester)||!isClinicalId(patient))return Response.json({code:'invalid_measurement'},{status:400});
 try{
  const rows=await rpc('demo_historical_measurement_list',{p_tester:tester,p_patient:patient}) as HistoricalMeasurement[];
  return Response.json({measurements:rows.map(historicalMeasurementProjection)});
 }catch(error){return failure(error)}
}
async function post(request:Request){
 const body=await request.json().catch(()=>null);
 if(!body||!isClinicalId(body.tester)||!isClinicalId(body.patient_id)||!isClinicalId(body.request_id)
 ||!validHistoricalScore(body.instrument,body.score)||!validAdministrationDate(body.administered_on)
 ||(body.note!==undefined&&(typeof body.note!=='string'||body.note.length>2000))
 ||body.answers!=null||body.session_id!=null||body.appointment_id!=null
 ||(body.supersedes_id!=null&&(!isClinicalId(body.supersedes_id)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500)))
  return Response.json({code:'invalid_measurement'},{status:422});
 try{
  const value=await rpc('demo_historical_measurement_save',{
   p_tester:body.tester,p_patient:body.patient_id,p_request:body.request_id,p_instrument:body.instrument,
   p_score:body.score,p_administered_on:body.administered_on,p_note:body.note||'',p_source:'historical_manual',
   p_supersedes:body.supersedes_id||null,p_reason:body.reason||'',
  });
  const row=(Array.isArray(value)?value[0]:value) as HistoricalMeasurement;
  queueSummary(request,body.patient_id);
  return Response.json({measurement:historicalMeasurementProjection(row)});
 }catch(error){return failure(error)}
}
export const GET=withPilot(get);
export const POST=withPilot(post);
