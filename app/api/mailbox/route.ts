import {cookies} from 'next/headers';
import {createHash,randomBytes} from 'node:crypto';
import {pilotClient} from '@/lib/pilot/server';
import {withPilot} from '@/lib/pilot/route';
import {seal} from '@/lib/mail/crypto';
import {authorization,ready,type Provider} from '@/lib/mail/providers';
export const dynamic='force-dynamic';
async function get(){const client=await pilotClient();const {data,error}=await client.rpc('pilot_mailbox_get');if(error)return Response.json({error:'Δεν φορτώθηκε το email αποστολής.'},{status:503});return Response.json({mailbox:data?{provider:data.provider,email:data.email}:null,providers:{google:ready('google'),microsoft:ready('microsoft')}})}
async function post(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Μη έγκυρη προέλευση.'},{status:403});const b=await req.json().catch(()=>({})),client=await pilotClient();
 if(b.action==='disconnect'){const {error}=await client.rpc('pilot_mailbox_disconnect');return Response.json(error?{error:'Δεν έγινε αποσύνδεση.'}:{ok:true},{status:error?503:200})}
 if(b.action!=='connect'||!['google','microsoft'].includes(b.provider))return Response.json({error:'Μη έγκυρη επιλογή.'},{status:400});
 const provider=b.provider as Provider;if(!ready(provider))return Response.json({error:'Η σύνδεση αυτού του παρόχου δεν έχει ρυθμιστεί ακόμη. Μπορείτε να ανοίξετε το μήνυμα στο mailbox σας.'},{status:503});
 const {data:{user}}=await client.auth.getUser();if(!user)return Response.json({error:'Συνδεθείτε.'},{status:401});
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 (await cookies()).set('noima-mail-oauth',seal({state,verifier,provider,user:user.id,created:Date.now()},user.id),{httpOnly:true,secure:true,sameSite:'lax',path:'/api/mailbox',maxAge:600});
 return Response.json({url:authorization(provider,state,createHash('sha256').update(verifier).digest('base64url'))});
}
export const GET=withPilot(get);export const POST=withPilot(post);
