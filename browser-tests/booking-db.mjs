import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import pg from 'pg';
const url=process.env.BOOKING_TEST_DATABASE_URL;if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('CI-only local PostgreSQL fixture required');
const pool=new pg.Pool({connectionString:url,max:10});const admin=await pool.connect();
const uid=randomUUID(),wid=randomUUID(),other=randomUUID();const clients=[];
async function owner(id=uid,workspace=wid){const c=await pool.connect();clients.push(c);await c.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.workspace',$2,false)",[id,workspace]);await c.query('set role authenticated');return c}
const scalar=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0].v;
try{
 await admin.query(readFileSync('browser-tests/booking-db-fixture.sql','utf8'));await admin.query(readFileSync('docs/sql/practice-booking.sql','utf8'));
 const a=await owner(),b=await owner(),outsider=await owner(other,randomUUID());
 await assert.rejects(()=>a.query('select * from private.practice_booking_requests'),/permission denied/);
 const settings={enabled:true,days:[1,2,3,4,5,6,7],start_time:'11:00',end_time:'19:00',duration:50,buffer:10};
 await a.query("select public.practice_booking_owner('configure',$1)",[settings]);
 let availability=await scalar(admin,'select public.practice_booking_availability($1) v',[uid]);assert.equal(availability.enabled,true);assert.ok(availability.slots.length>10);
 for(const slot of availability.slots){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Athens',hour:'2-digit',hourCycle:'h23'}).format(new Date(slot.start)));assert.ok(hour>=11&&hour<19);assert.equal(Date.parse(slot.end)-Date.parse(slot.start),50*60000);assert.deepEqual(Object.keys(slot).sort(),['end','start'])}
 const s=availability.slots[0],id=randomUUID(),payload={id,name:'Συνθετικός Ασθενής',email:'synthetic@example.com',phone:'6900000000',kind:'Δια ζώσης',consent:true,website:'',...s};
 for(const patch of [{consent:false},{consent:'true'},{name:null},{phone:null},{email:'bad'},{kind:'bad'},{website:'bot'}])await assert.rejects(()=>admin.query('select public.practice_booking_submit($1,$2)',[uid,{...payload,...patch,id:randomUUID()}]));
 await Promise.all(Array.from({length:4},()=>pool.query('select public.practice_booking_submit($1,$2)',[uid,payload])));
 await admin.query('select public.practice_booking_submit($1,$2)',[uid,{...payload,id:randomUUID()}]);assert.equal(Number(await scalar(admin,'select count(*) v from private.practice_booking_requests')),1);
 await assert.rejects(()=>admin.query('select public.practice_booking_submit($1,$2)',[uid,{...payload,name:'Different'}]),/booking_id_conflict/);
 await assert.rejects(()=>outsider.query("select public.practice_booking_owner('approve',null,$1,null,true)",[id]),/booking_not_found/);
 await assert.rejects(()=>a.query("select public.practice_booking_owner('approve',null,$1)",[id]),/booking_patient_choice_required/);
 const responses=await Promise.all([a.query("select public.practice_booking_owner('approve',null,$1,null,true) v",[id]),b.query("select public.practice_booking_owner('approve',null,$1,null,true) v",[id])]);
 assert.equal(responses[0].rows[0].v.event_id,responses[1].rows[0].v.event_id);assert.equal(Number(await scalar(admin,'select count(*) v from public.demo_calendar_events')),1);assert.equal(Number(await scalar(admin,'select count(*) v from public.demo_patients')),1);
 availability=await scalar(admin,'select public.practice_booking_availability($1) v',[uid]);assert.equal(availability.slots.some(t=>t.start===s.start),false);
 await admin.query('select public.practice_booking_submit($1,$2)',[uid,payload]);assert.equal(Number(await scalar(admin,'select count(*) v from private.practice_booking_requests')),1);
 await admin.query("update public.demo_calendar_events set status='cancelled'");availability=await scalar(admin,'select public.practice_booking_availability($1) v',[uid]);assert.equal(availability.slots.some(t=>t.start===s.start),true);
 // Two pending requests can share a slot, but only one can become an appointment.
 const id2=randomUUID(),id3=randomUUID();await admin.query('select public.practice_booking_submit($1,$2)',[uid,{...payload,id:id2,email:'two@example.com'}]);await admin.query('select public.practice_booking_submit($1,$2)',[uid,{...payload,id:id3,email:'three@example.com'}]);
 const result=await Promise.allSettled([a.query("select public.practice_booking_owner('approve',null,$1,null,true)",[id2]),b.query("select public.practice_booking_owner('approve',null,$1,null,true)",[id3])]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.match(String(result.find(r=>r.status==='rejected').reason),/booking_slot_conflict/);assert.equal(Number(await scalar(admin,'select count(*) v from public.demo_patients')),2);
 // Rejection changes only the request; cancellation/moves are read live from calendar.
 const pending=await scalar(admin,"select id v from private.practice_booking_requests where status='pending' limit 1");await a.query("select public.practice_booking_owner('reject',null,$1)",[pending]);await assert.rejects(()=>a.query("select public.practice_booking_owner('approve',null,$1,null,true)",[pending]),/booking_resolved/);
 const existing=(await admin.query('select id from public.demo_patients limit 1')).rows[0].id;
 availability=await scalar(admin,'select public.practice_booking_availability($1) v',[uid]);const s2=availability.slots[3],id4=randomUUID();await admin.query('select public.practice_booking_submit($1,$2)',[uid,{...payload,...s2,id:id4,email:'four@example.com'}]);
 // A normal calendar write wins the same workspace lock; approval rechecks after it.
 await admin.query('begin');await admin.query('select pg_advisory_xact_lock(hashtextextended($1,721))',[wid]);await admin.query('insert into public.demo_calendar_events(tester_id,patient_id,scheduled_start,scheduled_end) values($1,$2,$3,$4)',[wid,existing,s2.start,s2.end]);
 const pendingApproval=a.query("select public.practice_booking_owner('approve',null,$1,$2,false)",[id4,existing]);await admin.query('commit');await assert.rejects(()=>pendingApproval,/booking_slot_conflict/);
 assert.equal(Number(await scalar(admin,'select count(*) v from public.demo_patients')),2);
 await a.query("select public.practice_booking_owner('configure',$1)",[{...settings,enabled:false}]);assert.equal((await scalar(admin,'select public.practice_booking_availability($1) v',[uid])).slots.length,0);
 await a.query("select public.practice_booking_owner('configure',$1)",[settings]);await admin.query("update public.demo_calendar_events set status='cancelled'");const before=Number(await scalar(admin,'select count(*) v from private.practice_booking_requests'));await admin.query('select public.practice_booking_submit($1,$2)',[uid,{...payload,id:randomUUID()}]);assert.equal(Number(await scalar(admin,'select count(*) v from private.practice_booking_requests')),before+1);
 const state=await scalar(a,"select public.practice_booking_owner('read') v");assert.ok(state.requests.some(r=>r.event_status==='cancelled'));assert.equal((await scalar(outsider,"select public.practice_booking_owner('read') v")).requests.length,0);
 console.log('PASS: opt-in, live availability, privacy, invalid input, idempotent submissions, tenant isolation, explicit patient choice, concurrent approvals, cancellations, rejection, calendar conflicts, no orphan patients');
}finally{for(const c of clients){await c.query('reset role').catch(()=>{});c.release()}admin.release();await pool.end()}
