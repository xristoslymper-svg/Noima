// Source-controlled isolated preview backend. Never deploy to the production project.
import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {publicSnapshot,validateBooking} from '../../../lib/presence/public-policy.ts';
// Existing NOIMA Auth is used ONLY for read-only user verification and pilot_identity.
const primary='https://mgpnaxaquzeoomxdzhic.supabase.co';
const key='sb_publishable_g4MJzSlAYzIFAt9glM_WeQ_UcP-yheG';
const isolatedPreview='https://yncfbugkneywrwotuyls.supabase.co';
if(Deno.env.get('SUPABASE_URL')!==isolatedPreview)throw new Error('Isolated preview project required; refusing all other databases');
const db=createClient(isolatedPreview,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex','Referrer-Policy':'no-referrer'}});
Deno.serve(async req=>{
 try{
 if(req.method!=='POST')return json({error:'method'},405);
 const raw=await req.text();if(raw.length>250000)return json({error:'Το περιεχόμενο είναι πολύ μεγάλο.'},413);
 const b=JSON.parse(raw);let result;
 if(b.action==='read'||b.action==='request'){
  if(typeof b.slug!=='string'||!/^[a-z0-9][a-z0-9-]{2,59}$/.test(b.slug))return json({error:'Η σελίδα δεν βρέθηκε.'},404);
  const {data:s,error}=await db.from('practice_sites').select('content,revision').eq('slug',b.slug).maybeSingle();
  if(error)throw error;if(!s)return json({error:'Η σελίδα δεν βρέθηκε.'},404);
  if(b.action==='read')return json(s.content);
  const r=validateBooking(b.request);if(r.kind==='Online'&&!s.content.practice.online)return json({error:'Δεν προσφέρονται online συνεδρίες.'},400);
  const {data,error:e}=await db.rpc('practice_request',{p_slug:b.slug,p_id:r.id,p_payload:r});if(e)throw e;return json(data);
 }
 const auth=req.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer '))return json({error:'Συνδεθείτε.'},401);
 const account=createClient(primary,key,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:{user},error:authError}=await account.auth.getUser(auth.slice(7));if(authError||!user)return json({error:'Συνδεθείτε.'},401);
 const {data:identity,error:identityError}=await account.rpc('pilot_identity');if(identityError||!identity?.workspace_id)return json({error:'Δεν υπάρχει προσωπικός χώρος.'},403);
 // Owner always derives from verified Auth, never from supplied JSON.
 if(b.action==='owner'){
 const {data:site,error}=await db.from('practice_sites').select('slug,revision,content').eq('owner_id',user.id).maybeSingle();if(error)throw error;
 const {data:requests,error:e}=await db.from('practice_requests').select('id,payload,created_at').eq('site_id',user.id).order('created_at',{ascending:false}).limit(100);if(e)throw e;
 return json({site,requests});
 }
 if(b.action==='publish'){
 const content=publicSnapshot(b.workspace);if(!Number.isInteger(b.revision)||b.revision<0)return json({error:'Ανανεώστε τη σελίδα.'},400);
 const {data,error}=await db.rpc('practice_publish',{p_owner:user.id,p_content:content,p_revision:b.revision});if(error)throw error;result=data;
 }else return json({error:'Μη έγκυρη ενέργεια.'},400);
 return json(result);
 }catch(e){const message=String(e?.message||'');if(message.includes('publication_conflict'))return json({error:'Η δημοσιευμένη έκδοση άλλαξε σε άλλο παράθυρο. Ανανεώστε πριν δημοσιεύσετε ξανά.'},409);if(message.includes('preview_limit'))return json({error:'Συμπληρώθηκε το δωρεάν όριο δοκιμής. Δεν έγινε νέα καταχώριση.'},429);return json({error:'Η ενέργεια δεν ολοκληρώθηκε. Ελέγξτε τα στοιχεία και δοκιμάστε ξανά.'},400)}
});
