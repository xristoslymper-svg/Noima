// Real React components + actual migrated PostgreSQL RPCs behind a synthetic HTTP/auth adapter.
// This does not assert Vercel/Supabase production deployment or real external integrations.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createWorkflowDatabase} from './workflow-postgres.mjs';
const out=resolve('test-results/visit-workflow');mkdirSync(out,{recursive:true});
await build({stdin:{contents:`import LocaleFixture from './browser-tests/LocaleFixture';import React from 'react';import {createRoot} from 'react-dom/client';import PatientWorkspace from './components/patients/PatientWorkspace';import CalendarPage from './app/calendar/page';import './app/globals.css';import './app/clinical-refinement.css';import './app/visit-workspace.css';import './app/mobile.css';import './app/initial-assessment.css';import './app/clinical-editor.css';import './app/noima-ui.css';const id=location.pathname.split('/').pop();createRoot(document.getElementById('root')).render(<LocaleFixture>{location.pathname==='/calendar'?<CalendarPage/>:<PatientWorkspace patientRef={id}/>}</LocaleFixture>);`,loader:'jsx',resolveDir:process.cwd()},bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_NOIMA_MOBILE_V2':'"0"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'},plugins:[{name:'synthetic-navigation',setup(b){b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'synthetic-navigation'}));b.onLoad({filter:/.*/,namespace:'synthetic-navigation'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/link'?"import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}":"export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:u=>location.assign(u),replace:u=>location.replace(u),refresh:()=>location.reload()});"}));}}]});
const db=await createWorkflowDatabase();
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');res.setHeader('cache-control','no-store');
 if(url.pathname.startsWith('/api/')){
  res.setHeader('content-type','application/json');try{let body=null;if(req.method!=='GET'){let raw='';for await(const c of req)raw+=c;body=JSON.parse(raw||'{}')}const result=await db.dispatch(url.pathname,url.searchParams,body);return res.end(JSON.stringify(result))}catch(e){res.statusCode=409;return res.end(JSON.stringify({error:e.message}))}
 }
 if(['/fixture.js','/fixture.css'].includes(url.pathname)){res.setHeader('content-type',url.pathname.endsWith('.js')?'text/javascript':'text/css');return res.end(readFileSync(resolve(out,url.pathname.slice(1))))}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const [size,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})){
  async function check(name,type,fn){
   const info=await db.seed(type),context=await browser.newContext({viewport});await context.addCookies([{name:'noima-workspace-id',value:db.tester,url:origin}]);await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
   const record=origin+'/patients/demo/'+info.patientId+'?tab=record&session='+info.sessionId;
   async function open(){await page.goto(record);await page.locator('dialog[open]').waitFor();await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).waitFor();assert.deepEqual(errors,[])}
   const administration=()=>page.getByRole('region',{name:'Διεκπεραίωση επίσκεψης',exact:true});
   async function finalize(){await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).click();await administration().waitFor();await page.locator('dialog[open]').getByText('Η καταγραφή οριστικοποιήθηκε.',{exact:true}).waitFor();const s=(await db.state()).sessions.find(s=>s.id===info.sessionId);assert.equal(s.status,'completed');assert.ok(s.completed_at);}
   try{await fn({page,context,info,open,record,administration,finalize});assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no page horizontal overflow');await page.screenshot({path:resolve(out,size+'-'+name+'.png')});results.push({name,size,status:'passed'});console.log('PASS',size,name)}
   catch(e){await page.screenshot({path:resolve(out,size+'-'+name+'-failed.png')}).catch(()=>{});writeFileSync(resolve(out,size+'-'+name+'-dom.txt'),await page.locator('body').innerText().catch(()=>''));results.push({name,size,status:'failed',error:e.message,errors});console.error('FAIL',size,name,e.message,errors)}
   finally{await context.close();writeFileSync(resolve(out,'report.json'),JSON.stringify({scope:'React/browser and real PostgreSQL repository migrations/RPCs; synthetic HTTP/auth adapter. No remote AI, SMS, email, live database or production patient data.',results},null,2))}
  }
  await check('initial-finalize-payment-next-visit','initial_assessment',async({page,info,open,administration,finalize})=>{
   await open();await finalize();const admin=administration();await admin.getByRole('button',{name:'Πληρωμένο',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Κατάσταση πληρωμής"] button[aria-pressed="true"]')?.textContent==='Πληρωμένο');
   assert.equal((await db.state()).appointments.find(a=>a.id===info.eventId).payment_status,'paid');
   await admin.getByRole('button',{name:'Προγραμματισμός',exact:true}).click();await admin.getByRole('button',{name:'Σε 4 εβδομάδες',exact:true}).click();await admin.getByLabel('Ώρα Αθήνας',{exact:true}).fill(size==='desktop'?'09:00':'11:00');await admin.getByRole('button',{name:'Προγραμματισμός',exact:true}).click();await admin.getByText('Το ραντεβού αποθηκεύτηκε.',{exact:true}).waitFor();
   const saved=await db.state();assert.equal(saved.appointments.length,2);assert.equal(saved.sessions.find(s=>s.id===info.sessionId).status,'completed');assert.equal(db.requests.filter(r=>r.action==='finalize_session').length,1);
   await page.reload();await administration().getByRole('button',{name:'Πληρωμένο',exact:true}).waitFor();assert.equal(await administration().getByRole('button',{name:'Πληρωμένο',exact:true}).getAttribute('aria-pressed'),'true');assert.equal((await db.state()).appointments.length,2);
  });
  await check('compact-followup-finalizes-once','follow_up',async({open,finalize,info})=>{await open();await finalize();assert.equal(db.requests.filter(r=>r.action==='finalize_closure').length,1);assert.equal((await db.state()).sessions.find(s=>s.id===info.sessionId).closure_draft,null)});
  await check('detailed-followup-finalizes-once','follow_up',async({page,open,finalize})=>{await open();await page.getByRole('button',{name:'Αναλυτική καταγραφή',exact:false}).click();await page.getByRole('button',{name:'Σύντομη καταγραφή',exact:true}).waitFor();await finalize();assert.equal(db.requests.filter(r=>r.action==='finalize_closure').length,1)});
  for(const mode of ['compact','detailed'])await check(mode+'-blocker-focus','follow_up',async({page,open,info})=>{
   await open();if(mode==='detailed')await page.getByRole('button',{name:'Αναλυτική καταγραφή',exact:false}).click();
   const field=page.locator('[id="'+info.sessionId+'-closure-clinical_state_summary"]');await field.fill('');
   await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'Χρειάζεται καταγραφή: Κλινική εικόνα.'}).waitFor();
   await page.waitForFunction(id=>document.activeElement?.id===id,info.sessionId+'-closure-clinical_state_summary');
   assert.equal((await db.state()).sessions.find(s=>s.id===info.sessionId).status,'draft');assert.equal(db.requests.filter(r=>r.action==='finalize_closure').length,0);
  });
  await check('recovery-requires-consent-and-preserves-local','follow_up',async({page,open,info})=>{
   await open();db.faults.save=100;const field=page.getByRole('textbox',{name:'Κλινική εικόνα',exact:true});await field.fill('QA UNSAVED LOCAL TEXT');const load=page.getByRole('button',{name:'Φόρτωση αποθηκευμένου προχείρου…',exact:true});await load.waitFor();await load.click();assert.equal(await field.inputValue(),'QA UNSAVED LOCAL TEXT');await page.getByRole('button',{name:'Ακύρωση φόρτωσης',exact:true}).click();assert.equal(await field.inputValue(),'QA UNSAVED LOCAL TEXT');await load.click();await page.getByRole('button',{name:'Διατήρηση αντιγράφου και φόρτωση',exact:true}).click();
   await page.waitForFunction(id=>document.getElementById(id)?.value==='QA saved state',info.sessionId+'-closure-clinical_state_summary');
   await page.locator('summary').filter({hasText:'Αντίγραφο μη αποθηκευμένων αλλαγών'}).click();assert.match(await page.getByRole('textbox',{name:'Αντίγραφο μη αποθηκευμένων αλλαγών',exact:true}).inputValue(),/QA UNSAVED LOCAL TEXT/);
   assert.equal((await db.state()).sessions.find(s=>s.id===info.sessionId).closure_draft.clinical_state_summary,'QA saved state');
   await page.reload();await page.locator('summary').filter({hasText:'Αντίγραφο μη αποθηκευμένων αλλαγών'}).click();assert.match(await page.getByRole('textbox',{name:'Αντίγραφο μη αποθηκευμένων αλλαγών',exact:true}).inputValue(),/QA UNSAVED LOCAL TEXT/);
  });
  await check('retry-save-does-not-replace-local','follow_up',async({page,open,info})=>{
   await open();db.faults.save=100;await page.getByRole('textbox',{name:'Κλινική εικόνα',exact:true}).fill('QA RETRY CONTENT');const retry=page.getByRole('button',{name:'Επανάληψη αποθήκευσης',exact:true});await retry.waitFor();db.faults.save=0;await retry.click();await page.waitForFunction(()=>!document.querySelector('[aria-label="Ανάκτηση προχείρου"]'));assert.equal((await db.state()).sessions.find(s=>s.id===info.sessionId).closure_draft.clinical_state_summary,'QA RETRY CONTENT');
  });
  await check('immediate-escape-flushes-exact-session','follow_up',async({page,open,info,record})=>{
   await open();await page.getByRole('textbox',{name:'Κλινική εικόνα',exact:true}).fill('QA IMMEDIATE ESC');await page.keyboard.press('Escape');await page.locator('dialog[open]').waitFor({state:'hidden'});
   assert.equal((await db.state()).sessions.find(s=>s.id===info.sessionId).closure_draft.clinical_state_summary,'QA IMMEDIATE ESC');await page.goto(record);assert.equal(await page.getByRole('textbox',{name:'Κλινική εικόνα',exact:true}).inputValue(),'QA IMMEDIATE ESC');
  });
  await check('two-tabs-reject-stale-overwrite','follow_up',async({page,context,record,open,info})=>{
   await open();const second=await context.newPage();await second.goto(record);await second.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).waitFor();
   await page.getByRole('textbox',{name:'Κλινική εικόνα',exact:true}).fill('QA TAB ONE');await Promise.all([page.waitForResponse(r=>r.request().postDataJSON()?.action==='save_closure'&&r.ok()),page.getByRole('textbox',{name:'Κλινική εικόνα',exact:true}).blur()]);
   await second.getByRole('textbox',{name:'Κλινική εικόνα',exact:true}).fill('QA TAB TWO');await second.getByRole('button',{name:'Φόρτωση αποθηκευμένου προχείρου…',exact:true}).waitFor();assert.equal(await second.getByRole('button',{name:'Επανάληψη αποθήκευσης',exact:true}).count(),0);
   assert.equal((await db.state()).sessions.find(s=>s.id===info.sessionId).closure_draft.clinical_state_summary,'QA TAB ONE');await second.getByRole('button',{name:'Φόρτωση αποθηκευμένου προχείρου…',exact:true}).click();await second.getByRole('button',{name:'Διατήρηση αντιγράφου και φόρτωση',exact:true}).click();await second.locator('summary').filter({hasText:'Αντίγραφο μη αποθηκευμένων αλλαγών'}).click();assert.match(await second.getByRole('textbox',{name:'Αντίγραφο μη αποθηκευμένων αλλαγών',exact:true}).inputValue(),/QA TAB TWO/);await second.close();
  });
  await check('double-click-finalization-is-single-mutation','follow_up',async({page,open,administration,info})=>{
   await open();await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).evaluate(b=>{b.click();b.click()});await administration().waitFor();assert.equal(db.requests.filter(r=>r.action==='finalize_closure').length,1);assert.equal((await db.state()).sessions.find(s=>s.id===info.sessionId).status,'completed');await page.reload();await administration().waitFor();assert.equal(db.requests.filter(r=>r.action==='finalize_closure').length,1);
  });
  await check('committed-finalization-refresh-failure-is-read-only','follow_up',async({page,open,administration,info})=>{
   await open();db.faults.refreshAfterFinalize=true;await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).click();await administration().waitFor();await page.getByRole('button',{name:'Έλεγχος ολοκλήρωσης',exact:true}).click();await page.locator('dialog[open]').getByText('Η καταγραφή οριστικοποιήθηκε.',{exact:true}).waitFor();assert.equal(db.requests.filter(r=>r.action==='finalize_closure').length,1);assert.equal((await db.state()).sessions.find(s=>s.id===info.sessionId).status,'completed');
  });
  await check('detailed-recovery-fails-closed-on-storage-error','follow_up',async({page,open,info})=>{
   await open();await page.getByRole('button',{name:'Αναλυτική καταγραφή',exact:false}).click();db.faults.save=100;const field=page.getByRole('textbox',{name:'Συμπτώματα / πορεία *',exact:true});await field.fill('QA KEEP WHEN STORAGE FAILS');await page.getByRole('button',{name:'Φόρτωση αποθηκευμένου προχείρου…',exact:true}).click();
   await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.includes('older-recovery'))throw new DOMException('QA quota','QuotaExceededError');return original.call(this,k,v)}});
   await page.getByRole('button',{name:'Διατήρηση αντιγράφου και φόρτωση',exact:true}).click();await page.getByRole('alert').filter({hasText:'QA quota'}).waitFor();assert.equal(await field.inputValue(),'QA KEEP WHEN STORAGE FAILS');assert.equal((await db.state()).sessions.find(s=>s.id===info.sessionId).closure_draft.clinical_state_summary,'QA saved state');
  });
  await check('administrative-errors-preserve-clinical-completion','follow_up',async({page,open,finalize,administration,info})=>{
   await open();await finalize();const before=(await db.state()).sessions.find(s=>s.id===info.sessionId);db.faults.payment=1;await administration().getByRole('button',{name:'Πληρωμένο',exact:true}).click();await page.getByRole('alert').filter({hasText:'Synthetic payment failure'}).waitFor();assert.notEqual((await db.state()).appointments.find(a=>a.id===info.eventId).payment_status,'paid');
   await administration().getByRole('button',{name:'Προγραμματισμός',exact:true}).click();await administration().getByRole('button',{name:'Σε 3 εβδομάδες',exact:true}).click();db.faults.booking=1;await administration().getByRole('button',{name:'Προγραμματισμός',exact:true}).click();await page.getByRole('alert').filter({hasText:'Synthetic booking failure'}).waitFor();assert.equal((await db.state()).appointments.length,1);const after=(await db.state()).sessions.find(s=>s.id===info.sessionId);assert.equal(after.status,'completed');assert.equal(after.version,before.version);assert.equal(+after.completed_at,+before.completed_at);
  });
  await check('booking-commit-refresh-failure-prevents-resubmission','follow_up',async({page,open,finalize,administration})=>{
   await open();await finalize();const admin=administration();await admin.getByRole('button',{name:'Προγραμματισμός',exact:true}).click();await admin.getByRole('button',{name:'Σε 2 εβδομάδες',exact:true}).click();await admin.getByLabel('Ώρα Αθήνας',{exact:true}).fill(size==='desktop'?'12:00':'14:00');db.faults.refreshAfterBooking=true;await admin.getByRole('button',{name:'Προγραμματισμός',exact:true}).click();await admin.getByRole('button',{name:'Έλεγχος αποθήκευσης ραντεβού',exact:true}).waitFor();assert.equal((await db.state()).appointments.length,2);assert.equal(await admin.getByRole('button',{name:'Νέο ραντεβού',exact:true}).isDisabled(),true);await admin.getByRole('button',{name:'Έλεγχος αποθήκευσης ραντεβού',exact:true}).click();await admin.getByText('Το ραντεβού επιβεβαιώθηκε.',{exact:true}).waitFor();assert.equal(db.requests.filter(r=>r.path==='/api/calendar/command/apply').length,1);await page.reload();await administration().getByRole('button',{name:'Νέο ραντεβού',exact:true}).waitFor();assert.equal((await db.state()).appointments.length,2);
  });

  await check('calendar-button-preserves-real-origin','follow_up',async({page,info})=>{
   await page.goto(origin+'/calendar');await page.getByLabel('Μετάβαση σε ημερομηνία',{exact:true}).fill(info.date);await page.getByRole('button',{name:'Ημέρα',exact:true}).click();await page.getByLabel('Κατάσταση ραντεβού',{exact:true}).selectOption('scheduled');
   await page.getByRole('button',{name:'Συνέχεια',exact:true}).click();await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('session'),info.sessionId);assert.equal(await page.evaluate(()=>history.state.noimaVisitCalendar.date),info.date);
   await page.getByRole('button',{name:'Επιστροφή στο πρόγραμμα',exact:true}).click();await page.getByLabel('Μετάβαση σε ημερομηνία',{exact:true}).waitFor();assert.equal(await page.getByLabel('Μετάβαση σε ημερομηνία',{exact:true}).inputValue(),info.date);assert.equal(await page.getByLabel('Κατάσταση ραντεβού',{exact:true}).inputValue(),'scheduled');assert.equal(await page.evaluate(()=>history.state.noimaCalendar.view),'day');
  });

  await check('current-appointment-excluded-and-calendar-return','follow_up',async({page,open,info})=>{
   await open();await page.getByText('Δεν έχει προγραμματιστεί επόμενο ραντεβού.',{exact:true}).waitFor();
   // A compact three-hour calendar has no vertical scroll range. Seed morning
   // and evening events so the saved 300px position is physically reachable.
   const current=(await db.state()).appointments.find(a=>a.id===info.eventId);
   for(const hour of [6,19]){const start=new Date(current.scheduled_start);start.setUTCHours(hour,0,0,0);await db.dispatch('/api/calendar/command/apply',new URLSearchParams(),{tester:db.tester,action:'create',patient_id:info.patientId,start_iso:start.toISOString(),end_iso:new Date(+start+3000000).toISOString(),appointment_type:'follow_up'})}
   const position={workspace:db.tester,date:info.date,view:'week',filter:'scheduled',top:300,left:0,pageTop:0};await page.evaluate(position=>history.replaceState({...history.state,noimaVisitCalendar:position},''),position);await page.getByRole('button',{name:'Επιστροφή στο πρόγραμμα',exact:true}).click();await page.getByLabel('Μετάβαση σε ημερομηνία',{exact:true}).waitFor();assert.equal(await page.getByLabel('Μετάβαση σε ημερομηνία',{exact:true}).inputValue(),info.date);assert.equal(await page.getByLabel('Κατάσταση ραντεβού',{exact:true}).inputValue(),'scheduled');assert.equal(await page.evaluate(()=>history.state.noimaCalendar.date),info.date);assert.equal(await page.evaluate(()=>sessionStorage.getItem('noima-calendar-resume')),null);
   await page.waitForFunction(()=>Math.abs((document.querySelector('.calendar-week-card')?.scrollTop??-1)-300)<2);
   assert.equal(await page.evaluate(()=>history.state.noimaCalendar.view),'week');
  });
 }
}finally{await browser.close();await new Promise(r=>server.close(r));await db.close()}
assert.equal(results.filter(r=>r.status==='failed').length,0,JSON.stringify(results.filter(r=>r.status==='failed')));console.log('Passed '+results.length+' visit workflow PostgreSQL/browser checks.');
