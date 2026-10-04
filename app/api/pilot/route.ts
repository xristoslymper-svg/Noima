import { pilotClient } from '@/lib/pilot/server';
import { cookies } from 'next/headers';
export const dynamic='force-dynamic';
export async function GET(){
 const client=await pilotClient();const {data:{user}}=await client.auth.getUser();
 if(!user)return Response.json({error:'Συνδεθείτε.'},{status:401});
 const {data:identity}=await client.rpc('pilot_identity');
 return Response.json({email:user.email,identity},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:Request){
 const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return Response.json({error:'Μη έγκυρη προέλευση.'},{status:403});
 const b=await request.json().catch(()=>null);if(!b||typeof b!=='object')return Response.json({error:'Μη έγκυρο αίτημα.'},{status:400});
 const client=await pilotClient();
 if(b.action==='login'){
  const {error}=await client.auth.signInWithPassword({email:String(b.email||'').trim(),password:String(b.password||'')});
  return error?Response.json({error:'Ελέγξτε email, κωδικό και επιβεβαίωση email.'},{status:400}):Response.json({ok:true});
 }
 if(b.action==='signup'){
  if(String(b.password||'').length<12)return Response.json({error:'Ο κωδικός χρειάζεται τουλάχιστον 12 χαρακτήρες.'},{status:400});
  const {data,error}=await client.auth.signUp({email:String(b.email||'').trim(),password:String(b.password||'')});
  return error?Response.json({error:'Δεν δημιουργήθηκε ο λογαριασμός. Δοκιμάστε ξανά.'},{status:400}):Response.json({ok:true,confirmation_required:!data.session});
 }
 const {data:{user}}=await client.auth.getUser();if(!user)return Response.json({error:'Συνδεθείτε.'},{status:401});
 if(b.action==='logout'){
  const {error}=await client.auth.signOut();if(error)return Response.json({error:'Δεν έγινε αποσύνδεση.'},{status:502});
  (await cookies()).delete('noima-workspace-id');return Response.json({ok:true});
 }
 if(b.action==='redeem'){
  const {data,error}=await client.rpc('pilot_redeem_invitation',{p_code:String(b.code||''),p_name:String(b.name||'')});
  return error?Response.json({error:'Η πρόσκληση δεν είναι έγκυρη ή το email δεν έχει επιβεβαιωθεί.'},{status:400}):Response.json({identity:data});
 }
 const {data:identity}=await client.rpc('pilot_identity');if(!identity)return Response.json({error:'Χρειάζεται ενεργή πρόσκληση.'},{status:403});
 if(b.action==='feedback'){
  const {error}=await client.rpc('pilot_feedback_submit',{p_category:b.category,p_message:b.message,p_page:String(b.page||'')});
  return error?Response.json({error:'Η αναφορά δεν αποθηκεύτηκε. Γράψτε 5–4000 χαρακτήρες.'},{status:400}):Response.json({ok:true});
 }
 if(b.action==='reset'||b.action==='restore'){
  if(b.confirm!==true)return Response.json({error:'Επιβεβαιώστε την αλλαγή χώρου.'},{status:400});
  const {data,error}=await client.rpc('pilot_reset_workspace',{p_restore:b.action==='restore'});
  if(error)return Response.json({error:'Ο χώρος δεν άλλαξε.'},{status:400});
  (await cookies()).set('noima-workspace-id',data.workspace_id,{sameSite:'lax',secure:new URL(request.url).protocol==='https:',path:'/'});
  return Response.json({identity:data});
 }
 return Response.json({error:'Μη έγκυρη ενέργεια.'},{status:400});
}
