import { withPilot } from '@/lib/pilot/route';
import {patientBundle} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {patientRecordText} from '@/lib/clinical/record-export';
import {patientRecordPrintableHtml} from '@/lib/clinical/record-export-print';
import {randomBytes} from 'node:crypto';
export const dynamic='force-dynamic';
async function handleGET(request:Request){
 const url=new URL(request.url),tester=url.searchParams.get('tester'),patient=url.searchParams.get('patient');
 if(!isClinicalId(tester)||!isClinicalId(patient))return Response.json({error:'Μη έγκυρος φάκελος.'},{status:400});
 if(process.env.CLINICAL_DATA_MODE==='real')return Response.json({error:'Δεν έχει ενεργοποιηθεί πραγματική κλινική πρόσβαση.'},{status:403});
 try{
  const bundle=await patientBundle(tester,patient);
  if(url.searchParams.get('format')==='print'){
   const nonce=randomBytes(18).toString('base64');
   const html=patientRecordPrintableHtml(bundle,nonce);
   return new Response(html,{headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Content-Disposition':'inline',
    'Cache-Control':'private, no-store, max-age=0',
    'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
   }});
  }
  return new Response(patientRecordText(bundle),{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="noima-patient-${patient}.txt"`,'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Δεν έγινε εξαγωγή του φακέλου.'},{status:503});}
}

export const GET = withPilot(handleGET);
