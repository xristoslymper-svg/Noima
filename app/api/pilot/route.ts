import { pilotClient } from '@/lib/pilot/server';
import { cookies } from 'next/headers';
import {authEmailEnabled} from '@/lib/pilot/auth-email';
export const dynamic='force-dynamic';
function reply(body:Record<string,unknown>,options:{status?:number}={}) {
 return Response.json(body,{...options,headers:{'Cache-Control':'private, no-store'}});
}
function emailValue(value:unknown) {
 const email=typeof value==='string'?value.trim().toLowerCase():'';
 return email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:null;
}
export async function GET(){
 const client=await pilotClient();const {data:{user},error}=await client.auth.getUser();
 if(error&&error.status&&error.status>=500)return reply({error:'Η σύνδεση δεν είναι διαθέσιμη προσωρινά.'},{status:503});
 if(error||!user)return reply({error:'Συνδεθείτε.'},{status:401});
 const {data:identity,error:identityError}=await client.rpc('pilot_identity');
 if(identityError)return reply({error:'Δεν φορτώθηκε ο προσωπικός σας χώρος.'},{status:503});
 const providers=Array.isArray(user.app_metadata?.providers)?user.app_metadata.providers:[user.app_metadata?.provider].filter(Boolean);
 return reply({user_id:user.id,email:user.email,identity,has_password:providers.includes('email')});
}
export async function POST(request:Request){
 const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return reply({error:'Μη έγκυρη προέλευση.'},{status:403});
 const b=await request.json().catch(()=>null);if(!b||typeof b!=='object'||Array.isArray(b))return reply({error:'Μη έγκυρο αίτημα.'},{status:400});
 const client=await pilotClient();
 if(b.action==='google'){
  const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('/auth/callback',request.url).href,skipBrowserRedirect:true}});
  return error?reply({error:'Η σύνδεση Google δεν είναι διαθέσιμη ακόμη.'},{status:503}):reply({url:data.url});
 }
 if(b.action==='login'){
  const email=emailValue(b.email),password=typeof b.password==='string'?b.password:'';
  if(!email||!password||password.length>128)return reply({error:'Συμπληρώστε έγκυρο email και κωδικό.'},{status:400});
  const {error}=await client.auth.signInWithPassword({email,password});
  return error?reply({error:'Ελέγξτε email, κωδικό και επιβεβαίωση email.'},{status:400}):reply({ok:true});
 }
 if(b.action==='signup'){
  if(!authEmailEnabled)return reply({error:'Η δημιουργία λογαριασμού με email δεν είναι διαθέσιμη ακόμη. Επιλέξτε «Συνέχεια με Google».'},{status:503});
  const email=emailValue(b.email),password=typeof b.password==='string'?b.password:'';
  if(!email)return reply({error:'Συμπληρώστε έγκυρο email.'},{status:400});
  if(password.length<12||password.length>128)return reply({error:'Ο κωδικός χρειάζεται 12–128 χαρακτήρες.'},{status:400});
  const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:new URL('/auth/callback',request.url).href}});
  return error?reply({error:'Δεν δημιουργήθηκε ο λογαριασμός. Δοκιμάστε ξανά.'},{status:400}):reply({ok:true,confirmation_required:!data.session});
 }
 const {data:{user}}=await client.auth.getUser();if(!user)return reply({error:'Συνδεθείτε.'},{status:401});
 if(b.action==='join'){
  const name=typeof b.name==='string'?b.name.trim():'';
  if(name.length<2||name.length>100)return reply({error:'Συμπληρώστε ονοματεπώνυμο 2–100 χαρακτήρων.'},{status:400});
  const {data,error}=await client.rpc('pilot_join',{p_name:name});
  return error||!data?reply({error:'Επιβεβαιώστε το email σας και συμπληρώστε το όνομά σας.'},{status:400}):reply({identity:data});
 }
 if(b.action==='logout'){
  const {error}=await client.auth.signOut({scope:'local'});if(error)return reply({error:'Δεν έγινε αποσύνδεση.'},{status:502});
  (await cookies()).delete('noima-workspace-id');return reply({ok:true});
 }
 if(b.action==='redeem'){
  const {data,error}=await client.rpc('pilot_redeem_invitation',{p_code:String(b.code||''),p_name:String(b.name||'')});
  return error?reply({error:'Η πρόσκληση δεν είναι έγκυρη ή το email δεν έχει επιβεβαιωθεί.'},{status:400}):reply({identity:data});
 }
 const {data:identity}=await client.rpc('pilot_identity');if(!identity)return reply({error:'Ολοκληρώστε τη δημιουργία του προσωπικού σας χώρου.'},{status:403});
 if(['invite_create','invite_list','invite_revoke'].includes(b.action)){
  if(!identity.can_invite)return reply({error:'Η διαχείριση προσκλήσεων είναι διαθέσιμη στον ιδιοκτήτη.'},{status:403});
  const {data,error}=await client.rpc(b.action==='invite_create'?'pilot_invite_create':b.action==='invite_list'?'pilot_invite_list':'pilot_invite_revoke',b.action==='invite_create'?{p_email:b.email||null}:b.action==='invite_revoke'?{p_id:b.id}:{});
  return error?reply({error:'Η ενέργεια πρόσκλησης δεν ολοκληρώθηκε.'},{status:400}):reply({result:data});
 }
 if(b.action==='feedback'){
  const {error}=await client.rpc('pilot_feedback_submit',{p_category:b.category,p_message:b.message,p_page:String(b.page||'')});
  return error?reply({error:'Η αναφορά δεν αποθηκεύτηκε. Γράψτε 5–4000 χαρακτήρες.'},{status:400}):reply({ok:true});
 }
 if(b.action==='reset'||b.action==='restore'){
  if(b.confirm!==true)return reply({error:'Επιβεβαιώστε την αλλαγή χώρου.'},{status:400});
  const {data,error}=await client.rpc('pilot_reset_workspace',{p_restore:b.action==='restore'});
  if(error)return reply({error:'Ο χώρος δεν άλλαξε.'},{status:400});
  (await cookies()).set('noima-workspace-id',data.workspace_id,{sameSite:'lax',secure:new URL(request.url).protocol==='https:',path:'/'});
  return reply({identity:data});
 }
 return reply({error:'Μη έγκυρη ενέργεια.'},{status:400});
}
