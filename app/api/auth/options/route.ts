import {supabaseKey,supabaseUrl} from '@/lib/pilot/config';
export const dynamic='force-dynamic';
export async function GET(){
 try{const r=await fetch(supabaseUrl+'/auth/v1/settings',{headers:{apikey:supabaseKey},cache:'no-store'});const d=await r.json();return Response.json({google:r.ok&&d.external?.google===true},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({google:false})}
}
