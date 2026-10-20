import {presenceCall} from './hosted-server';
const primary=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://mgpnaxaquzeoomxdzhic.supabase.co';
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_g4MJzSlAYzIFAt9glM_WeQ_UcP-yheG';
// Public RPCs return only opt-in free slots or a generic receipt, never calendar rows.
export async function publicBooking(slug:string,request?:unknown){
 if(!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug))return Response.json({error:'Η σελίδα δεν βρέθηκε.'},{status:404});
 const target=await presenceCall({action:'booking_target',slug});if(!target.ok)return target;
 const t=await target.json();if(!t.owner_id)return Response.json({error:'Η σελίδα δεν βρέθηκε.'},{status:404});
 if(request&&typeof request==='object'&&(request as {kind?:string}).kind==='Online'&&!t.online)return Response.json({error:'Δεν προσφέρονται online συνεδρίες.'},{status:400});
 try{
 const r=await fetch(primary+'/rest/v1/rpc/'+(request?'practice_booking_submit':'practice_booking_availability'),{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_owner:t.owner_id,...(request?{p_request:request}:{})}),cache:'no-store',signal:AbortSignal.timeout(15000)});
 const data=await r.json();if(!r.ok){const message=String(data.message||'');if(/booking_slot_conflict|booking_id_conflict/.test(message))return Response.json({error:'Η ώρα δεν είναι πλέον διαθέσιμη. Ανανεώστε και επιλέξτε άλλη ώρα.',code:'booking_slot_conflict'},{status:409});if(message.includes('booking_disabled'))return Response.json({error:'Τα online αιτήματα δεν είναι ενεργά. Επικοινωνήστε με το ιατρείο.'},{status:409});if(message.includes('booking_limit'))return Response.json({error:'Συμπληρώθηκε το δωρεάν όριο αιτημάτων. Επικοινωνήστε με το ιατρείο.'},{status:429});throw new Error('booking_unavailable')}
 return Response.json(data,{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch{return Response.json({error:'Δεν φορτώθηκαν οι διαθέσιμες ώρες. Δοκιμάστε ξανά· δεν έχει κλειστεί ραντεβού.'},{status:503})}
}
