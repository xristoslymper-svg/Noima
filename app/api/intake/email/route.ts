import {createTranslator} from 'next-intl';
import {loadMessages} from '@/i18n/messages';
import {recipientLocale,recipientLink} from '@/i18n/recipient';
import type {Locale} from '@/i18n/config';
import {errorJson} from '@/i18n/errors';
import {pilotClient} from '@/lib/pilot/server';
import {withPilot} from '@/lib/pilot/route';
import {seal,unseal} from '@/lib/mail/crypto';
import {send,tokens,validEmail,type Tokens,type Provider} from '@/lib/mail/providers';

export const dynamic='force-dynamic';

const allowedTools=new Set(['history','PHQ-9','GAD-7']);
const durations:Record<string,[number,number]>={history:[7,10],'PHQ-9':[2,5],'GAD-7':[2,3]};
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char));
function validTools(value:unknown):value is string[]{return Array.isArray(value)&&value.length>0&&value.length<=3&&value.every(item=>typeof item==='string'&&allowedTools.has(item))&&new Set(value).size===value.length}
async function message(link:string,doctorName:string,tools:string[],locale:Locale){
 const t=createTranslator({locale,messages:await loadMessages(locale)});
 const [min,max]=tools.reduce(([lo,hi],tool)=>[lo+durations[tool][0],hi+durations[tool][1]],[0,0]);
 const invitation=t('notifications.intakeEmailInvitation',{doctor:doctorName||t('notifications.intakeEmailClinic')});
 const duration=t('notifications.intakeEmailDuration',{min,max}),privacy=t('notifications.intakeEmailPrivacy');
 const subject=t('notifications.intakeEmailSubject');
 const body=[t('notifications.intakeEmailGreeting'),'',invitation,duration,'',t('notifications.intakeEmailLink'),link,'',privacy,'','NOIMA'].join('\n');
 const html=`<!doctype html><html lang="${locale}"><body style="margin:0;padding:28px;background:#f4f6f3;font-family:Arial,sans-serif;color:#2f4138"><main style="max-width:560px;margin:auto;padding:28px;background:white;border:1px solid #e1e7e3;border-radius:18px"><div>Ψ · NOIMA</div><h1>${escapeHtml(t('notifications.intakeEmailHeading'))}</h1><p>${escapeHtml(invitation)}</p><p>${escapeHtml(duration)}</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#477663;color:white;padding:13px 18px;border-radius:10px">${escapeHtml(subject)}</a></p><p style="font-size:12px">${escapeHtml(privacy)}</p></main></body></html>`;
 return {subject,body,html};
}

async function post(req:Request){
 const b=await req.json().catch(()=>({}));
 if(!validEmail(b.to)||typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token)||typeof b.intake_id!=='string'||!/^[a-f0-9-]{36}$/i.test(b.intake_id)||!validTools(b.tools))return errorJson({error:'Ελέγξτε τον παραλήπτη και την ανάθεση.'},{status:400});
 const doctorName=typeof b.doctor_name==='string'?b.doctor_name.trim().slice(0,120):'';
 const locale=recipientLocale(b.recipient_locale);
 const link=recipientLink(new URL('/intake',process.env.NOIMA_APP_ORIGIN||req.url).href+'#'+b.token,locale);
 const content=await message(link,doctorName,b.tools,locale);
 const client=await pilotClient(),{data:{user}}=await client.auth.getUser();
 if(!user)return errorJson({error:'Συνδεθείτε.'},{status:401});
 const {data:mailbox,error:loadError}=await client.rpc('pilot_mailbox_get');
 if(loadError||!mailbox)return errorJson({error:'Συνδέστε πρώτα το email αποστολής σας από τον λογαριασμό.',code:'connect',fallback:content},{status:409});
 let grant:Tokens;
 try{
  grant=unseal<Tokens>(mailbox.encrypted_tokens,user.id);
  if(grant.expires_at<Date.now()+60000){
   const updated=await tokens(mailbox.provider,{grant_type:'refresh_token',refresh_token:grant.refresh_token});
   grant={...updated,refresh_token:updated.refresh_token||grant.refresh_token};
   const {error}=await client.rpc('pilot_mailbox_save',{p_provider:mailbox.provider,p_email:mailbox.email,p_tokens:seal(grant,user.id)});
   if(error)throw new Error('save');
  }
 }catch{return errorJson({error:'Συνδέστε ξανά το email αποστολής σας.',code:'connect',fallback:content},{status:409})}
 const {data:claim,error}=await client.rpc('pilot_intake_mail_claim',{p_intake:b.intake_id,p_token:b.token,p_recipient:b.to});
 if(error)return errorJson({error:'Ο σύνδεσμος δεν είναι διαθέσιμος για αποστολή.'},{status:409});
 if(claim==='accepted')return Response.json({ok:true,status:'accepted'});
 if(claim!=='new')return errorJson({error:'Η προηγούμενη αποστολή δεν έχει επιβεβαιωθεί. Ελέγξτε τα απεσταλμένα.',code:'unknown'},{status:409});
 try{
  const id=await send(mailbox.provider as Provider,grant.access_token,mailbox.email,b.to,content.subject,content.body,content.html);
  const {error:finishError}=await client.rpc('pilot_intake_mail_finish',{p_intake:b.intake_id,p_status:'accepted',p_provider_id:id});
  if(finishError)return errorJson({error:'Το email έγινε δεκτό, αλλά δεν αποθηκεύτηκε η επιβεβαίωση.',code:'unknown'},{status:503});
  return Response.json({ok:true,status:'accepted'});
 }catch(e){
  const known=e instanceof Error&&['mail_reconnect','mail_rejected'].includes(e.message);
  await client.rpc('pilot_intake_mail_finish',{p_intake:b.intake_id,p_status:known?'failed':'unknown'});
  return errorJson({error:known?'Το email δεν έγινε δεκτό. Ελέγξτε τη σύνδεση email.':'Δεν γνωρίζουμε αν το email στάλθηκε. Ελέγξτε τα απεσταλμένα.',code:known?'failed':'unknown'},{status:502});
 }
}
export const POST=withPilot(post);
