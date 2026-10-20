import {withPilot} from '@/lib/pilot/route';
import {rpc,listPatients} from '@/lib/patients/demo-runtime';
import {bookingEnabled,validBookingSettings} from '@/lib/presence/booking';
export const dynamic='force-dynamic';
function failure(e:unknown){const m=e instanceof Error?e.message:'';if(/booking_slot_conflict|calendar_conflict/.test(m))return Response.json({error:'Η ώρα δεν είναι πλέον διαθέσιμη. Δεν δημιουργήθηκε ραντεβού. Επικοινωνήστε για άλλη ώρα.',code:'booking_slot_conflict'},{status:409});if(/booking_not_found|booking_resolved|booking_patient/.test(m))return Response.json({error:'Ανανεώστε το αίτημα και επιλέξτε τον σωστό ασθενή.'},{status:409});return Response.json({error:'Η ενέργεια δεν ολοκληρώθηκε. Ανανεώστε και δοκιμάστε ξανά.'},{status:503})}
export const GET=withPilot(async(req:Request)=>{
 if(!bookingEnabled(process.env))return new Response(null,{status:404});
 try{const data=await rpc('practice_booking_owner',{p_action:'read'});const patients=await listPatients(new URL(req.url).searchParams.get('tester')||'');return Response.json({...data as object,patients:patients.map(p=>({id:p.id,name:(p.first_name+' '+p.last_name).trim()}))})}catch(e){return failure(e)}
});
export const POST=withPilot(async(req:Request)=>{
 if(!bookingEnabled(process.env))return new Response(null,{status:404});
 const b=await req.json().catch(()=>null);if(!b||!['configure','approve','reject'].includes(b.action))return new Response(null,{status:400});
 if(b.action==='configure'&&!validBookingSettings(b.settings))return Response.json({error:'Ελέγξτε ημέρες, ωράριο και διάρκεια.'},{status:400});
 if(b.action!=='configure'&&(!/^[a-f0-9-]{36}$/i.test(b.id||'')||b.confirmed!==true))return Response.json({error:'Χρειάζεται επιβεβαίωση της ενέργειας.'},{status:400});
 if(b.patient_id&&!/^[a-f0-9-]{36}$/i.test(b.patient_id))return new Response(null,{status:400});
 try{return Response.json(await rpc('practice_booking_owner',{p_action:b.action,p_config:b.settings||null,p_request:b.id||null,p_patient:b.patient_id||null,p_new:b.new_patient===true}))}catch(e){return failure(e)}
});
