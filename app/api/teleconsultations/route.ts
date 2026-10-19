import {withPilot} from '@/lib/pilot/route';
import {request as read} from '@/lib/patients/demo-runtime';
import {persistentVisitEnabled} from '@/lib/teleconsultations/policy';
export const dynamic='force-dynamic';
export const preferredRegion='fra1';
async function all(path:string){
 const rows:unknown[]=[];
 for(let offset=0;;offset+=500){const page=await read(path+'&order=id.asc&limit=500&offset='+offset);if(!Array.isArray(page))throw new Error('invalid_list');rows.push(...page);if(page.length<500)return rows}
}
async function get(req:Request){
 if(!persistentVisitEnabled(process.env))return new Response(null,{status:404});
 const tester=new URL(req.url).searchParams.get('tester')||'',scope='&tester_id=eq.'+encodeURIComponent(tester);
 try{
  const from=new Date(Date.now()-36*60*60*1000).toISOString(),until=new Date(Date.now()+36*60*60*1000).toISOString();
  const [patients,visits,appointments]=await Promise.all([
   all('demo_patients?select=id,first_name,last_name'+scope),
   all('demo_sessions?select=id,patient_id,session_type,status,version,closure_version,started_at,completed_at,updated_at'+scope+'&session_type=eq.follow_up&status=eq.draft'),
   all('demo_calendar_events?select=id,patient_id,session_id,status,scheduled_start,scheduled_end'+scope+'&appointment_type=eq.follow_up&status=eq.scheduled&scheduled_start=gte.'+from+'&scheduled_start=lt.'+until)
  ]);
  return Response.json({patients,visits,appointments});
 }catch{return Response.json({error:'Δεν φορτώθηκαν οι επισκέψεις. Δοκιμάστε ξανά.'},{status:503})}
}
export const GET=withPilot(get);
