import {unsavedLocaleSwitch,localePersistenceAndRecipient,assertLoginPresentation,assertWorkspacePresentation} from './i18n-application.mjs';
// C: browser -> actual Next.js handlers -> local Supabase Auth/PostgREST/RPCs.
// Only run on a disposable GitHub runner. Never accepts a remote database URL.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright';
assert.equal(process.env.GITHUB_ACTIONS,'true','This suite requires an isolated CI runner');
const config=JSON.parse(execFileSync('npx',['supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const api=config.API_URL,key=config.ANON_KEY;
assert.equal(new URL(api).hostname,'127.0.0.1');assert.equal(new URL(api).port,'54321');
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,CLINICAL_DATA_MODE:'synthetic',EXTERNAL_AI_ENABLED:'false',NEXT_PUBLIC_NOIMA_MOBILE_V2:'0'};
execFileSync('npm',['run','build'],{env,stdio:'inherit'});
// NextURL canonicalizes loopback hosts to localhost; use that same origin so
// browser requests exercise the unchanged same-origin protection correctly.
const server=spawn('npm',['run','start','--','--hostname','localhost','--port','3100'],{env,stdio:'ignore'}),origin='http://localhost:3100';
const admin=createClient(api,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const out=resolve('test-results/visit-application-api');mkdirSync(out,{recursive:true});const results=[],timings=[];
let browser;
try{
 for(let i=0;i<90;i++){try{if((await fetch(origin+'/login')).ok)break}catch{}if(i===89)throw Error('Next server unavailable');await new Promise(r=>setTimeout(r,500))}
 browser=await chromium.launch();
 async function user(label){const email=`qa-${randomUUID()}@example.invalid`,password=randomUUID()+'QA!';const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);
  const client=createClient(api,key,{auth:{persistSession:false,autoRefreshToken:false}});const auth=await client.auth.signInWithPassword({email,password});assert.equal(auth.error,null);
  const joined=await client.rpc('pilot_join',{p_name:'QA '+label});assert.equal(joined.error,null);return {email,password,client,workspace:joined.data.workspace_id};}
 const owner=await user('Workflow'),other=await user('Other Workspace');
 for(const [size,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})){
  const context=await browser.newContext({viewport,locale:'en-US'}),page=await context.newPage();page.setDefaultTimeout(15000);
  await context.route('**/*',r=>[origin,new URL(api).origin].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
  await page.goto(origin+'/login');assert.equal(await page.locator('html').getAttribute('lang'),'el');
  await assertLoginPresentation(page);await page.screenshot({path:resolve(out,size+'-login-el.png')});
  await page.getByLabel('Γλώσσα',{exact:true}).selectOption('en');await page.waitForFunction(()=>document.documentElement.lang==='en');await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await assertLoginPresentation(page);await page.screenshot({path:resolve(out,size+'-login-en.png')});
  await page.getByLabel('Language',{exact:true}).selectOption('el');await page.waitForFunction(()=>document.documentElement.lang==='el');
  const login=await context.request.post(origin+'/api/pilot',{headers:{origin},data:{action:'login',email:owner.email,password:owner.password}});assert.equal(login.status(),200,`Application login: ${(await login.json()).error??'ok'}`);
  const calls=[];page.on('request',r=>{if(r.url().includes('/api/'))calls.push({path:new URL(r.url()).pathname,method:r.method(),action:r.postDataJSON()?.action})});
  async function post(path,data){const r=await context.request.post(origin+path,{headers:{origin},data});const body=await r.json();assert.equal(r.ok(),true,`${path}: ${body.error}`);return body}
  const started=new Date();started.setUTCDate(started.getUTCDate()+2+(size==='mobile'?1:0));started.setUTCHours(10,0,0,0);
  // A new-patient appointment and session are created through the real routes.
  const created=await post('/api/calendar/command/apply',{action:'create',create_new_patient:true,request_id:randomUUID(),patient_name:'QA Synthetic '+size,start_iso:started.toISOString(),end_iso:new Date(+started+3000000).toISOString(),appointment_type:'initial_assessment',sms_reminder_enabled:false});
  const patientId=created.event.patient_id,appointmentId=created.event.id;
  const opened=await post('/api/calendar/appointment',{event_id:appointmentId});const sessionId=opened.session.id;
  for(const section of ['interview','mse','assessment','plan','review'])await post('/api/patients/demo/runtime',{action:'save_section',session_id:sessionId,section_key:section,content:'QA '+section,source:'manual',expected_version:null});
  await post('/api/patients/demo/runtime',{action:'save_risk',session_id:sessionId,risk:{suicidal_ideation:'negative',intent:'negative',plan:'negative',self_harm:'negative',attempt_history:'negative'},expected_version:null});
  const url=origin+'/patients/demo/'+patientId+'?tab=record&session='+sessionId;
  let at=performance.now(),offset=calls.length;await page.goto(url);await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).waitFor();timings.push({size,action:'open',ms:performance.now()-at,requests:calls.slice(offset)});
  const field=page.getByRole('textbox',{name:'Λόγος προσέλευσης & παρούσα εικόνα *',exact:true});
  at=performance.now();offset=calls.length;
  await unsavedLocaleSwitch({page,field,text:'QA UPDATED THROUGH REAL API',action:'save_section',client:owner.client,patientId,sessionId,size,mode:'initial',out});
  timings.push({size,action:'save',ms:performance.now()-at,requests:calls.slice(offset)});
  at=performance.now();offset=calls.length;await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).click();
  const area=page.getByRole('region',{name:'Διεκπεραίωση επίσκεψης',exact:true});await area.waitFor();
  await page.locator('dialog[open]').getByText('Η καταγραφή οριστικοποιήθηκε.',{exact:true}).waitFor();
  timings.push({size,action:'finalize',ms:performance.now()-at,requests:calls.slice(offset)});
  const session=(await owner.client.from('demo_sessions').select('*').eq('id',sessionId).single()).data;assert.equal(session.status,'completed');assert.ok(session.completed_at);assert.equal(session.patient_id,patientId);
  const sections=(await owner.client.from('demo_session_sections').select('*').eq('session_id',sessionId)).data;assert.ok(sections.some(s=>s.content==='QA UPDATED THROUGH REAL API'));
  await area.getByRole('button',{name:'Πληρωμένο',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Κατάσταση πληρωμής"] button[aria-pressed="true"]')?.textContent==='Πληρωμένο');
  const paid=(await owner.client.from('demo_calendar_events').select('*').eq('id',appointmentId).single()).data;assert.equal(paid.payment_status,'paid');assert.equal(paid.session_id,sessionId);assert.equal(paid.patient_id,patientId);
  await area.getByRole('button',{name:'Προγραμματισμός',exact:true}).click();await area.getByRole('button',{name:'Σε 4 εβδομάδες',exact:true}).click();await area.getByLabel('Ώρα Αθήνας',{exact:true}).fill(size==='mobile'?'11:00':'09:00');await area.getByRole('button',{name:'Προγραμματισμός',exact:true}).click();await area.getByText('Το ραντεβού αποθηκεύτηκε.',{exact:true}).waitFor();
  await page.reload();await area.waitFor();
  // The visit shell precedes the longitudinal appointment read. Wait for its
  // existing readiness gate, then assert the persisted payment without polling
  // for the desired value or accepting the temporary loading state.
  await area.locator(':scope[aria-busy="false"]').waitFor();
  assert.equal(await area.getByRole('button',{name:'Πληρωμένο',exact:true}).getAttribute('aria-pressed'),'true');
  const events=(await owner.client.from('demo_calendar_events').select('*').eq('patient_id',patientId)).data;assert.equal(events.length,2);assert.equal(events.filter(e=>e.status==='scheduled').length,1);
  const after=(await owner.client.from('demo_sessions').select('*').eq('id',sessionId).single()).data;assert.equal(after.version,session.version);assert.equal(after.completed_at,session.completed_at);
  assert.equal(calls.filter(c=>c.action==='finalize_session').length,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:resolve(out,size+'-completed.png')});
  at=performance.now();offset=calls.length;await page.getByRole('button',{name:'Επιστροφή στο πρόγραμμα',exact:true}).click();await page.getByLabel('Μετάβαση σε ημερομηνία',{exact:true}).waitFor();timings.push({size,action:'return',ms:performance.now()-at,requests:calls.slice(offset)});assert.equal(new URL(page.url()).pathname,'/calendar');
  await assertWorkspacePresentation(page);await page.screenshot({path:resolve(out,size+'-profile-alignment.png')});
  for(const [index,mode] of ['compact','detailed'].entries()){
   const date=new Date(+started+(index+1)*7*86400000);
   const appointment=await post('/api/calendar/command/apply',{action:'create',patient_id:patientId,start_iso:date.toISOString(),end_iso:new Date(+date+3000000).toISOString(),appointment_type:'follow_up'});
   const followup=(await post('/api/calendar/appointment',{event_id:appointment.event.id})).session;
   await post('/api/patients/demo/runtime',{action:'save_section',session_id:followup.id,section_key:'mse',content:'QA follow-up MSE',source:'manual',expected_version:null});
   await post('/api/patients/demo/runtime',{action:'save_risk',session_id:followup.id,risk:{suicidal_ideation:'negative',intent:'negative',plan:'negative',self_harm:'negative',attempt_history:'negative'},expected_version:null});
   await post('/api/patients/demo/runtime',{action:'save_closure',session_id:followup.id,expected_version:0,value:{transcript:'',clinical_state_summary:'QA follow-up state',treatment_decision:'QA decision',next_review_focus:'QA next review',adherence:'QA adherence',pinned_context:'',source:'manual'}});
   await page.goto(origin+'/patients/demo/'+patientId+'?tab=record&session='+followup.id);
   await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).waitFor();
   if(mode==='compact'){
    await page.getByRole('button',{name:'Συνέχεια αργότερα',exact:true}).click();await page.locator('dialog[open]').waitFor({state:'hidden'});
    const taskRows=await owner.client.rpc('demo_task_list',{p_tester:owner.workspace});assert.equal(taskRows.error,null);assert.ok(taskRows.data.some(t=>t.source_session_id===followup.id&&t.patient_id===patientId&&t.status==='open'));
    await page.goto(origin);await page.getByRole('button',{name:'Άνοιγμα εκκρεμοτήτων',exact:true}).click();
    await page.getByRole('dialog',{name:'Εκκρεμότητες',exact:true}).locator('a[href="/patients/demo/'+patientId+'?tab=record&session='+followup.id+'"]').click();
    await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('session'),followup.id);
   }else await page.getByRole('button',{name:'Αναλυτική καταγραφή',exact:false}).click();
   const followupField=page.getByRole('textbox',{name:mode==='compact'?'Κλινική εικόνα':/^Συμπτώματα/});
   await unsavedLocaleSwitch({page,field:followupField,text:'QA follow-up — Δεν αναφέρει νέα συμπτώματα. Drug 10 mg.',action:'save_closure',client:owner.client,patientId,sessionId:followup.id,size,mode:'followup-'+mode,out});
   const before=calls.filter(c=>c.action==='finalize_closure').length;
   await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).click();await area.waitFor();await page.locator('dialog[open]').getByText('Η καταγραφή οριστικοποιήθηκε.',{exact:true}).waitFor();
   assert.equal(calls.filter(c=>c.action==='finalize_closure').length,before+1);const saved=(await owner.client.from('demo_sessions').select('*').eq('id',followup.id).single()).data;assert.equal(saved.status,'completed');assert.equal(saved.patient_id,patientId);assert.equal(saved.closure_draft,null);
   await page.reload();await area.waitFor();assert.equal(calls.filter(c=>c.action==='finalize_closure').length,before+1);await page.screenshot({path:resolve(out,size+'-'+mode+'-followup.png')});
  }
  await localePersistenceAndRecipient({browser,context,page,origin,api,owner,other,patientId,sessionId,out,size});
  // Authentic membership and RLS: another user cannot read or mutate this visit.
  const unauthorized=await browser.newContext();await unauthorized.request.post(origin+'/api/pilot',{headers:{origin},data:{action:'login',email:other.email,password:other.password}});
  const denied=await unauthorized.request.get(origin+'/api/patients/demo/visit?patient='+patientId+'&session='+sessionId+'&tester='+owner.workspace);assert.equal(denied.ok(),false);
  const wrongPayment=await unauthorized.request.post(origin+'/api/calendar/payment',{headers:{origin},data:{tester:owner.workspace,event_id:appointmentId,status:'pending'}});assert.equal(wrongPayment.ok(),false);
  assert.equal((await owner.client.from('demo_calendar_events').select('payment_status').eq('id',appointmentId).single()).data.payment_status,'paid');
  await unauthorized.close();await context.close();results.push({size,status:'passed',scenario:'new appointment -> real save/finalize/payment/booking -> reload -> calendar; cross-workspace read/write rejected'});
 }
}catch(error){
 // These contexts can only reach the disposable synthetic application.
 for(const [index,context] of (browser?.contexts()??[]).entries())for(const [tab,page] of context.pages().entries())await page.screenshot({path:resolve(out,`failure-${index}-${tab}.png`)}).catch(()=>{});
 throw error;
}finally{
 writeFileSync(resolve(out,'report.json'),JSON.stringify({scope:'C: real Next.js application, Supabase Auth/PostgREST and repository migrations in disposable GitHub CI; synthetic users and records only',results,timings},null,2));
 await browser?.close();server.kill('SIGTERM');
}
assert.equal(results.length,2);console.log('PASS desktop and mobile real application API workflow; evidence contains synthetic records only.');
