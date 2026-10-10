import {withPilot} from '@/lib/pilot/route';
import {rpc,request,type DemoSession} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {narrativeWritingSections} from '@/lib/clinical/writing-policy';
export const runtime='nodejs';export const dynamic='force-dynamic';
// Creates an unapproved entry only. The existing, version-checked approval RPC
// is the sole path from this entry to a canonical narrative section.
async function handlePOST(req:Request){
 const b=await req.json().catch(()=>({}));
 if(!isClinicalId(b.session_id)||!narrativeWritingSections.includes(b.section)||!['dictation','ai'].includes(b.kind)||['original','text','transcript'].some(k=>typeof b[k]!=='string'||b[k].length>20000)||!b.text.trim()||b.transcript.trim().length<2)return Response.json({error:'Μη έγκυρο κείμενο προς έλεγχο.'},{status:400});
 const sessions=await request(`demo_sessions?select=id,status&tester_id=eq.${encodeURIComponent(b.tester)}&id=eq.${b.session_id}`) as DemoSession[];
 if(!sessions.some(s=>s.status==='draft'))return Response.json({error:'Η επίσκεψη δεν είναι διαθέσιμη.'},{status:404});
 const entry=await rpc('demo_proposal_create',{p_tester:b.tester,p_session:b.session_id,p_section:b.section,p_transcript:b.transcript,p_proposal:{clinical_text:b.text,facts:[],writing:{kind:b.kind,original:b.original}},p_model:b.kind==='ai'&&typeof b.model==='string'?b.model:null});
 return Response.json({entry:Array.isArray(entry)?entry[0]:entry});
}
export const POST=withPilot(handlePOST);
