// Exact repository migrations and RPCs; synthetic auth, no remote services.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
export async function createWorkflowDatabase(){
 const db=new PGlite(),owner='99000000-0000-4000-8000-000000000001';
 const sql=async(q,p=[])=>(await db.query(q,p)).rows;
 await db.exec("create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;");
 for(const name of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 await sql('insert into auth.users(id) values($1)',[owner]);await sql("insert into private.pilot_members(user_id,full_name) values($1,'Workflow synthetic owner')",[owner]);
 let queue=Promise.resolve();
 function transaction(fn){const task=queue.then(async()=>{await db.exec('begin; set local role authenticated');await sql("select set_config('request.jwt.claim.sub',$1,true)",[owner]);try{const value=await fn();await db.exec('commit');return value}catch(e){await db.exec('rollback');throw e}});queue=task.catch(()=>{});return task;}
 const [{identity}]=await transaction(()=>sql('select pilot_identity() identity')),tester=identity.workspace_id;
 await transaction(()=>sql('select demo_tester_bootstrap($1)',[tester]));
 let patient,session,event,index=0;const requests=[],faults={save:0,refresh:0,refreshAfterFinalize:false,payment:0,booking:0,refreshAfterBooking:false};
 async function bundle(){
  const tables=['demo_patients','demo_sessions','demo_session_sections','demo_risk_assessments','demo_patient_history','demo_calendar_events'];
  const values=[];for(const table of tables)values.push(await sql('select * from '+table+' where '+(table==='demo_patients'?'id':'patient_id')+'=$1 and tester_id=$2',[patient.id,tester]));
  const [patients,sessions,sections,risks,histories,appointments]=values;
  return {patient:patients[0],sessions,sections,risks,history:histories[0]||null,appointments,medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[],addenda:[],corrections:[],assessments:[],contextRevisions:[]};
 }
 async function seed(type='initial_assessment'){
  Object.assign(faults,{save:0,refresh:0,refreshAfterFinalize:false,payment:0,booking:0,refreshAfterBooking:false});requests.length=0;index++;
  await transaction(async()=>{
   [patient]=await sql('select * from demo_patient_create_v2($1,$2)',[tester,'QA Workflow '+index]);
   // Seed visits outside quick-booking weeks so independent scenarios cannot
   // collide with each other's legitimate future appointment mutations.
   const day=new Date();day.setUTCDate(day.getUTCDate()+index+60);day.setUTCHours(10,0,0,0);
   [{event}]=await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,$3::timestamptz,$4::timestamptz,$5) event",[tester,patient.id,day.toISOString(),new Date(day.getTime()+3000000).toISOString(),type]);
   [session]=await sql('select * from demo_calendar_start_session($1,$2)',[tester,event.id]);
   for(const key of type==='follow_up'?['mse']:['interview','mse','assessment','plan','review'])await sql("select * from demo_session_save_section($1,$2,$3,$4,'manual',null)",[tester,session.id,key,'QA '+key]);
   await sql('select * from demo_session_save_risk_tree($1,$2,$3::jsonb,null)',[tester,session.id,JSON.stringify({suicidal_ideation:'negative',intent:'negative',plan:'negative',self_harm:'negative',attempt_history:'negative'})]);
   if(type==='follow_up')await sql('select * from demo_closure_save($1,$2,$3::jsonb,0)',[tester,session.id,JSON.stringify({transcript:'',clinical_state_summary:'QA saved state',treatment_decision:'QA decision',next_review_focus:'QA next review',adherence:'QA adherence',pinned_context:'',source:'manual'})]);
  });
  return {patientId:patient.id,sessionId:session.id,eventId:event.id,date:new Date(event.scheduled_start).toISOString().slice(0,10),name:patient.first_name};
 }
 async function dispatch(path,query,body){
  requests.push({path,...body});
  if(path==='/api/calendar/payment'&&faults.payment>0){faults.payment--;throw Error('Synthetic payment failure')}
  if(path==='/api/calendar/command/apply'&&faults.booking>0){faults.booking--;throw Error('Synthetic booking failure')}
  if(body?.action==='save_closure'&&faults.save>0){faults.save--;throw new Error('Synthetic transient save failure')}
  if(['/api/patients/demo/visit','/api/patients/demo/runtime'].includes(path)&&!body&&faults.refresh>0){faults.refresh--;throw new Error('Synthetic refresh failure after commit')}
  return transaction(async()=>{
   if(path.includes('/summary'))throw new Error('Synthetic AI disabled');
   if(path==='/api/intake')return {intakes:[]};
   if(path==='/api/pilot/me')return {profile:{full_name:'QA owner'}};
   if(path==='/api/calendar/events')return {events:(await sql('select * from demo_calendar_events where tester_id=$1 and patient_id=$2 order by scheduled_start',[tester,patient.id])).map(e=>({...e,patient_name:patient.first_name,readiness:'ready',readiness_label:'Έτοιμο',detail:''}))};
   if(!body){
    if(path.includes('/api/patients/demo/')){
     if(path.endsWith('/runtime')&&!query.get('patient'))return {patients:[{...patient,last_session:session}]};
     const b=await bundle(),sid=query.get('session');if(sid)b.sessions=b.sessions.filter(s=>s.id===sid);return {bundle:b};
    }return {};
   }
   if(body.tester!==tester)throw new Error('Synthetic fixture workspace mismatch');
   if(path==='/api/calendar/appointment'){const [s]=await sql('select * from demo_calendar_start_session($1,$2)',[tester,body.event_id]);return {session:s}}
   if(path==='/api/calendar/payment'){const [e]=await sql('select * from demo_payment_set($1,$2,$3)',[tester,body.event_id,body.status]);return {event:e}}
   if(path==='/api/calendar/command/apply'&&body.action==='create'){const [{event:e}]=await sql("select demo_calendar_apply_v2($1,'create',null,$2,null,$3::timestamptz,$4::timestamptz,$5) event",[tester,body.patient_id,body.start_iso,body.end_iso,body.appointment_type]);if(faults.refreshAfterBooking){faults.refreshAfterBooking=false;faults.refresh=1}return {event:e}}
   let rows;
   switch(body.action){
    case 'save_section':rows=await sql('select * from demo_session_save_section($1,$2,$3,$4,$5,$6)',[tester,body.session_id,body.section_key,body.content,body.source||'manual',body.expected_version??null]);return {section:rows[0]};
    case 'save_document':rows=await sql('select * from demo_session_save_document($1,$2,$3,$4::jsonb,$5)',[tester,body.session_id,body.section_key,JSON.stringify(body.document),body.expected_version??null]);return {section:rows[0]};
    case 'save_risk':rows=await sql('select * from demo_session_save_risk_tree($1,$2,$3::jsonb,$4)',[tester,body.session_id,JSON.stringify(body.risk),body.expected_version??null]);return {risk:rows[0]};
    case 'save_closure':rows=await sql('select * from demo_closure_save($1,$2,$3::jsonb,$4)',[tester,body.session_id,JSON.stringify(body.value),body.expected_version]);return {session:rows[0]};
    case 'finalize_session':rows=await sql('select * from demo_session_finalize($1,$2,$3)',[tester,body.session_id,body.expected_version]);break;
    case 'finalize_closure':rows=await sql('select * from demo_closure_finalize($1,$2,$3,$4,$5)',[tester,body.session_id,body.expected_version,body.confirmed,body.expected_closure_version]);break;
    case 'finish_session_later':rows=await sql('select * from demo_task_for_session($1,$2)',[tester,body.session_id]);return {ok:true,task:rows[0]};
    case 'list':case 'mark_viewed':return {intakes:[]};
    default:throw new Error('Unexpected workflow fixture request: '+path+' '+body.action);
   }
   if(faults.refreshAfterFinalize){faults.refreshAfterFinalize=false;faults.refresh=1}return {session:rows[0]};
  });
 }
 return {tester,seed,dispatch,requests,faults,state:()=>transaction(bundle),close:async()=>{await queue;await db.close()}};
}
