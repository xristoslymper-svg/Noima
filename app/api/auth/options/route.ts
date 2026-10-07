import {supabaseKey,supabaseUrl} from '@/lib/pilot/config';
import {authEmailEnabled} from '@/lib/pilot/auth-email';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const r=await fetch(supabaseUrl+'/auth/v1/settings',{headers:{apikey:supabaseKey},cache:'no-store'});
  if(!r.ok)throw new Error('auth_options_unavailable');
  const d=await r.json();
  return Response.json({google:d.external?.google===true,email_signup:authEmailEnabled&&d.external?.email===true&&d.disable_signup!==true,email_recovery:authEmailEnabled&&d.external?.email===true},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Δεν φορτώθηκαν οι διαθέσιμοι τρόποι σύνδεσης.'},{status:503,headers:{'Cache-Control':'private, no-store'}})}
}
