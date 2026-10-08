import {pilotClient} from '@/lib/pilot/server';
import {withPilot} from '@/lib/pilot/route';
import {seal,unseal} from '@/lib/mail/crypto';
import {send,tokens,validEmail,type Tokens,type Provider} from '@/lib/mail/providers';

export const dynamic='force-dynamic';

const allowedTools=new Set(['history','PHQ-9','GAD-7']);
const durations:Record<string,[number,number]>={history:[7,10],'PHQ-9':[2,5],'GAD-7':[2,3]};
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char));
function validTools(value:unknown):value is string[]{return Array.isArray(value)&&value.length>0&&value.length<=3&&value.every(item=>typeof item==='string'&&allowedTools.has(item))&&new Set(value).size===value.length}
function estimate(tools:string[]){const [min,max]=tools.reduce(([lo,hi],tool)=>[lo+durations[tool][0],hi+durations[tool][1]],[0,0]);return min===max?min+' λεπτά':min+'–'+max+' λεπτά'}
function message(link:string,doctorName:string,tools:string[]){
 const duration=estimate(tools);
 const doctor=doctorName||'Το ιατρείο σας';
 const subject='Συμπλήρωση πριν την επίσκεψή σας';
 const body=[
  'Καλησπέρα σας,',
  '',
  doctor+' σας έχει ζητήσει να συμπληρώσετε μια σύντομη φόρμα πριν την επίσκεψή σας.',
  'Εκτιμώμενος χρόνος: '+duration+'.',
  '',
  'Ανοίξτε τον προσωπικό σύνδεσμο:',
  link,
  '',
  'Δεν χρειάζεται λογαριασμός. Ο σύνδεσμος είναι προσωπικός και λήγει σε 14 ημέρες.',
  'Μετά την υποβολή, οι απαντήσεις αποστέλλονται με ασφάλεια στο ιατρείο.',
  '',
  'Noima'
 ].join('\n');
 const safeDoctor=escapeHtml(doctor),safeLink=escapeHtml(link),safeDuration=escapeHtml(duration);
 const html=`<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#2f4138"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f3;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e1e7e3;border-radius:18px;overflow:hidden"><tr><td style="padding:24px 28px 10px"><div style="font-family:Georgia,serif;font-size:27px;color:#315344">Ψ</div></td></tr><tr><td style="padding:4px 28px 30px"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#829087;margin-bottom:9px">NOIMA</div><h1 style="font-family:Georgia,serif;font-size:27px;line-height:1.18;font-weight:500;margin:0 0 12px;color:#293c33">Μια σύντομη συμπλήρωση πριν την επίσκεψή σας</h1><p style="font-size:14px;line-height:1.65;margin:0 0 8px;color:#5f6f67">${safeDoctor} σας έχει ζητήσει να συμπληρώσετε μια σύντομη φόρμα.</p><p style="font-size:13px;line-height:1.55;margin:0 0 22px;color:#7c8882">Εκτιμώμενος χρόνος: <strong style="color:#4d6258">${safeDuration}</strong></p><a href="${safeLink}" style="display:inline-block;background:#477663;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 18px;border-radius:10px">Συμπλήρωση φόρμας</a><div style="border-top:1px solid #edf0ee;margin:26px 0 16px"></div><p style="font-size:11px;line-height:1.6;margin:0;color:#87928c">Δεν χρειάζεται λογαριασμός. Ο σύνδεσμος είναι προσωπικός και λήγει σε 14 ημέρες. Μετά την υποβολή, οι απαντήσεις αποστέλλονται με ασφάλεια στο ιατρείο.</p></td></tr></table><p style="font-size:10px;color:#9aa49f;margin:13px 0 0">Noima · ασφαλής συμπλήρωση από ασθενή</p></td></tr></table></body></html>`;
 return {subject,body,html};
}

async function post(req:Request){
 const b=await req.json().catch(()=>({}));
 if(!validEmail(b.to)||typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token)||typeof b.intake_id!=='string'||!/^[a-f0-9-]{36}$/i.test(b.intake_id)||!validTools(b.tools))return Response.json({error:'Ελέγξτε τον παραλήπτη και την ανάθεση.'},{status:400});
 const doctorName=typeof b.doctor_name==='string'?b.doctor_name.trim().slice(0,120):'';
 const link=new URL('/intake',process.env.NOIMA_APP_ORIGIN||req.url).href+'#'+b.token;
 const content=message(link,doctorName,b.tools);
 const client=await pilotClient(),{data:{user}}=await client.auth.getUser();
 if(!user)return Response.json({error:'Συνδεθείτε.'},{status:401});
 const {data:mailbox,error:loadError}=await client.rpc('pilot_mailbox_get');
 if(loadError||!mailbox)return Response.json({error:'Συνδέστε πρώτα το email αποστολής σας από τον λογαριασμό.',code:'connect',fallback:content},{status:409});
 let grant:Tokens;
 try{
  grant=unseal<Tokens>(mailbox.encrypted_tokens,user.id);
  if(grant.expires_at<Date.now()+60000){
   const updated=await tokens(mailbox.provider,{grant_type:'refresh_token',refresh_token:grant.refresh_token});
   grant={...updated,refresh_token:updated.refresh_token||grant.refresh_token};
   const {error}=await client.rpc('pilot_mailbox_save',{p_provider:mailbox.provider,p_email:mailbox.email,p_tokens:seal(grant,user.id)});
   if(error)throw new Error('save');
  }
 }catch{return Response.json({error:'Συνδέστε ξανά το email αποστολής σας.',code:'connect',fallback:content},{status:409})}
 const {data:claim,error}=await client.rpc('pilot_intake_mail_claim',{p_intake:b.intake_id,p_token:b.token,p_recipient:b.to});
 if(error)return Response.json({error:'Ο σύνδεσμος δεν είναι διαθέσιμος για αποστολή.'},{status:409});
 if(claim==='accepted')return Response.json({ok:true,status:'accepted'});
 if(claim!=='new')return Response.json({error:'Η προηγούμενη αποστολή δεν έχει επιβεβαιωθεί. Ελέγξτε τα απεσταλμένα.',code:'unknown'},{status:409});
 try{
  const id=await send(mailbox.provider as Provider,grant.access_token,mailbox.email,b.to,content.subject,content.body,content.html);
  const {error:finishError}=await client.rpc('pilot_intake_mail_finish',{p_intake:b.intake_id,p_status:'accepted',p_provider_id:id});
  if(finishError)return Response.json({error:'Το email έγινε δεκτό, αλλά δεν αποθηκεύτηκε η επιβεβαίωση.',code:'unknown'},{status:503});
  return Response.json({ok:true,status:'accepted'});
 }catch(e){
  const known=e instanceof Error&&['mail_reconnect','mail_rejected'].includes(e.message);
  await client.rpc('pilot_intake_mail_finish',{p_intake:b.intake_id,p_status:known?'failed':'unknown'});
  return Response.json({error:known?'Το email δεν έγινε δεκτό. Ελέγξτε τη σύνδεση email.':'Δεν γνωρίζουμε αν το email στάλθηκε. Ελέγξτε τα απεσταλμένα.',code:known?'failed':'unknown'},{status:502});
 }
}
export const POST=withPilot(post);
