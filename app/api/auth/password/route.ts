import {cookies} from 'next/headers';
import {pilotClient} from '@/lib/pilot/server';

export const dynamic='force-dynamic';

function reply(body:Record<string,unknown>,status=200){
 return Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
}

function validEmail(value:string){
 return value.length>=3&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value:string){
 return value.length>=12&&value.length<=128;
}

export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(!origin||origin!==new URL(request.url).origin)return reply({error:'Μη έγκυρη προέλευση.'},403);
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Μη έγκυρο αίτημα.'},400);
 const b=body as Record<string,unknown>;
 const action=String(b.action||'');
 const client=await pilotClient();

 if(action==='request_reset'){
  const email=String(b.email||'').trim().toLowerCase();
  if(!validEmail(email))return reply({error:'Συμπληρώστε έγκυρο email.'},400);
  await client.auth.resetPasswordForEmail(email,{redirectTo:new URL('/auth/callback',request.url).href});
  return reply({ok:true});
 }

 const {data:{user},error:userError}=await client.auth.getUser();
 if(userError||!user)return reply({error:'Η σύνδεση έληξε. Συνδεθείτε ξανά.'},401);
 const password=String(b.password||'');
 if(!validPassword(password))return reply({error:'Ο νέος κωδικός χρειάζεται 12–128 χαρακτήρες.'},400);

 if(action==='change'){
  const current=String(b.current_password||'');
  if(!current||current.length>128)return reply({error:'Συμπληρώστε τον τωρινό κωδικό.'},400);
  const {error}=await client.auth.updateUser({password,currentPassword:current});
  return error?reply({error:'Ο κωδικός δεν άλλαξε. Ελέγξτε τον τωρινό κωδικό και τις απαιτήσεις ασφαλείας.'},400):reply({ok:true});
 }

 if(action==='reset'){
  const {data:claimsData,error:claimsError}=await client.auth.getClaims();
  const claims=claimsData?.claims as {amr?:Array<{method?:string}>}|undefined;
  const recovery=!claimsError&&claims?.amr?.some(entry=>entry.method==='recovery');
  if(!recovery)return reply({error:'Ο σύνδεσμος επαναφοράς δεν είναι πλέον έγκυρος. Ζητήστε νέο σύνδεσμο.'},403);
  const {error}=await client.auth.updateUser({password});
  if(error)return reply({error:'Ο κωδικός δεν άλλαξε. Ζητήστε νέο σύνδεσμο και δοκιμάστε ξανά.'},400);
  await client.auth.signOut();
  const jar=await cookies();jar.delete('noima-workspace-id');
  return reply({ok:true});
 }

 return reply({error:'Μη έγκυρη ενέργεια.'},400);
}
