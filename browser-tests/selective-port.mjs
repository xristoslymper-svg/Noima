// Actual React components, actual new/intake API handlers, actual migrated PostgreSQL.
// Only authentication transport, existing folder read fixtures, mail and transcription are simulated.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {PGlite} from '@electric-sql/pglite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const out=resolve('test-results/selective-port');mkdirSync(out,{recursive:true});
const db=new PGlite(),owner=randomUUID(),scope=new AsyncLocalStorage();let queue=Promise.resolve();
const sql=async(q,p=[]) => (await db.query(q,p)).rows;
await db.exec("create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;");
for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
await sql('insert into auth.users(id) values($1)',[owner]);await sql("insert into private.pilot_members(user_id,full_name) values($1,'Synthetic Selective QA')",[owner]);
async function transaction(role,fn){await db.exec('begin;set local role '+role+';');if(role==='authenticated')await sql("select set_config('request.jwt.claim.sub',$1,true)",[owner]);try{const value=await fn();await db.exec('commit');return value}catch(e){await db.exec('rollback');throw e}}
const workspace=(await transaction('authenticated',()=>sql('select pilot_identity() value')))[0].value.workspace_id;
await transaction('authenticated',()=>sql('select demo_tester_bootstrap($1)',[workspace]));
const patient=(await transaction('authenticated',()=>sql("select * from demo_patient_create_v2($1,'Ira','Pira')",[workspace])))[0];
const baseFixture=JSON.parse(readFileSync('browser-tests/fixtures/warm-patient.json','utf8'));
const folder=JSON.parse(JSON.stringify(baseFixture).replaceAll(baseFixture.patient.id,patient.id).replaceAll(baseFixture.patient.tester_id,workspace));folder.patient={...folder.patient,...patient,first_name:'Ira',last_name:'Pira',email:'ira@example.invalid'};
const retsets=new Map((await sql("select proname,bool_or(proretset) is_set from pg_proc where pronamespace='public'::regnamespace group by proname")).map(row=>[row.proname,row.is_set]));
globalThis.__selectiveRpc=async(name,args)=>{
 assert.match(name,/^[a-z][a-z0-9_]+$/);const role=scope.getStore()||'anon';const names=Object.keys(args);for(const key of names)assert.match(key,/^[a-z][a-z0-9_]+$/);
 const pending=queue.then(()=>transaction(role,async()=>{const parameters=Object.values(args).map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v);const call='public.'+name+'('+names.map((key,i)=>key+'=> $'+(i+1)).join(',')+')';const rows=await sql('select to_jsonb(result) value from '+call+' result',parameters);return retsets.get(name)?rows.map(row=>row.value):rows[0]?.value}));queue=pending.catch(()=>{});return pending;
};
const routePlugin={name:'isolated-auth-sql',setup(b){
 b.onResolve({filter:/^@\/lib\/(pilot\/route|patients\/demo-runtime)$/},args=>({path:args.path,namespace:'isolated-auth-sql'}));
 b.onLoad({filter:/.*/,namespace:'isolated-auth-sql'},args=>({loader:'js',contents:args.path.includes('pilot/route')?'export const withPilot=handler=>handler;':'export const rpc=(name,args)=>globalThis.__selectiveRpc(name,args);'}));
}};
const routes={};for(const [url,file] of Object.entries({'/api/intake':'app/api/intake/route.ts','/api/intake/public':'app/api/intake/public/route.ts','/api/patients/demo/prior-course':'app/api/patients/demo/prior-course/route.ts'})){
 const target=resolve(out,url.split('/').join('-')+'.mjs');await build({entryPoints:[file],bundle:true,outfile:target,platform:'node',format:'esm',packages:'external',alias:{'@':process.cwd()},plugins:[routePlugin]});routes[url]=await import(pathToFileURL(target));
}
await build({entryPoints:['browser-tests/selective-port-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'},plugins:[{name:'test-navigation',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'test-navigation'}));
 b.onLoad({filter:/.*/,namespace:'test-navigation'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='next/link'?"import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}":"export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:u=>location.assign(u),replace:u=>location.replace(u),refresh:()=>location.reload()});"}));
}}]});
let assignments=[],mailAttempts=[],failNextMail=false,losePriorAck=false,transcriptions=0;const priorRequests=[];let origin;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin||'http://127.0.0.1');let raw='';for await(const chunk of req)raw+=chunk;
 const body=raw&&req.headers['content-type']?.includes('application/json')?JSON.parse(raw):{};
 const json=(value,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(value))};
 if(url.pathname==='/api/intake/email'){mailAttempts.push(body);if(failNextMail){failNextMail=false;return json({error:'Synthetic temporary email failure'},503)}return json({code:'connect',fallback:{subject:'Συμπλήρωση φόρμας',body:'Synthetic private link: '+origin+'/intake#'+body.token}},409)}
 if(url.pathname==='/api/transcribe'){transcriptions++;return json({text:'Συνθετική υπαγόρευση προηγούμενης παρακολούθησης.'})}
 if(routes[url.pathname]){
  const publicRoute=url.pathname==='/api/intake/public';if(!publicRoute&&!String(req.headers.cookie||'').includes('noima-workspace-id='+workspace))return json({error:'Synthetic auth required'},401);
  const request=new Request(url,{method:req.method,headers:{...req.headers,origin},...(req.method!=='GET'&&req.method!=='HEAD'?{body:raw}: {})});
  const response=await scope.run(publicRoute?'anon':'authenticated',()=>routes[url.pathname][req.method](request));const value=await response.json();
  if(url.pathname==='/api/intake'&&body.action==='assign'&&response.ok)assignments.push({request:body,response:value});
  if(url.pathname==='/api/patients/demo/prior-course'&&req.method==='POST'){priorRequests.push(body);if(losePriorAck&&response.ok){losePriorAck=false;return json({error:'Synthetic acknowledgement lost'},503)}}
  return json(value,response.status);
 }
 if(url.pathname.startsWith('/api/')){
  if(url.pathname.includes('summary'))return json({error:'External AI disabled'},503);
  if(url.pathname==='/api/patients/demo/runtime'&&!url.searchParams.has('patient'))return json({patients:[folder.patient]});
  if(url.pathname==='/api/patients/demo/runtime'||url.pathname==='/api/patients/demo/visit')return json({bundle:folder});
  return json({identity:null,events:[],intakes:[]});
 }
 if(['/fixture.js','/fixture.css'].includes(url.pathname)){res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(readFileSync(resolve(out,url.pathname.slice(1))))}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
}catch(error){console.error('Synthetic server:',error.message);res.statusCode=500;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:error.message}))}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});const results=[];
async function check(page,label,size){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label+' overflow');await page.screenshot({path:resolve(out,size+'-'+label+'.png'),fullPage:true});results.push({size,scenario:label,status:'passed'});console.log('PASS',size,label)}
try{for(const [size,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})){
 const context=await browser.newContext({viewport,permissions:['microphone']});await context.addCookies([{name:'noima-workspace-id',value:workspace,url:origin}]);await context.addInitScript(()=>{window.print=()=>{}});await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 await page.goto(origin+'/patients/demo/'+patient.id+'?tab=summary');const nav=page.locator('nav[aria-label="Καρτέλες φακέλου"]');await nav.waitFor();
 for(const label of ['Σύνοψη','Επισκέψεις','Θεραπευτικό πλάνο','Στοιχεία & ιστορικό'])assert.equal(await nav.getByRole('button',{name:label,exact:true}).count(),1);
 for(const label of ['Σύνοψη','Θεραπευτικό πλάνο','Στοιχεία & ιστορικό']){await nav.getByRole('button',{name:label,exact:true}).click();assert.equal(await page.getByRole('button',{name:'Προηγούμενη κλινική πορεία',exact:true}).count(),0);await check(page,'production-'+label,size)}
 await nav.getByRole('button',{name:'Επισκέψεις',exact:true}).click();const prior=page.getByRole('region',{name:'Προηγούμενη κλινική πορεία',exact:true});
 const edit=prior.getByRole('button',{name:size==='desktop'?'Προηγούμενη κλινική πορεία':'Επεξεργασία',exact:true});await edit.click();const text=prior.getByLabel('Κλινική πορεία',{exact:true});const content='Συνθετική προηγούμενη παρακολούθηση '+size+' χωρίς αναδρομικές συνεδρίες.';await text.fill(content);await prior.getByLabel(/Περίοδος προηγούμενης/).fill('2020–2025');
 await nav.getByRole('button',{name:'Σύνοψη',exact:true}).click();assert.match(page.url(),/tab=timeline/);assert.equal(await text.inputValue(),content);assert.equal(await page.locator('dialog[open]').count(),0);
 losePriorAck=true;const startRequests=priorRequests.length;await prior.getByRole('button',{name:'Αποθήκευση πορείας',exact:true}).click();await prior.getByRole('alert').waitFor();assert.equal(await text.inputValue(),content);await prior.getByRole('button',{name:'Αποθήκευση πορείας',exact:true}).click();await prior.getByRole('button',{name:'Επεξεργασία',exact:true}).waitFor();assert.equal(priorRequests.length,startRequests+2);assert.equal(priorRequests.at(-1).request_id,priorRequests.at(-2).request_id);await check(page,'prior-saved-inline',size);
 await page.reload();await prior.getByRole('button',{name:'Επεξεργασία',exact:true}).click();assert.equal(await text.inputValue(),content);
 await text.fill(content+' μη αποθηκευμένη διόρθωση');page.once('dialog',d=>d.dismiss());await text.press('Escape');assert.equal(await text.isVisible(),true);page.once('dialog',d=>d.accept());await prior.getByRole('button',{name:'Ακύρωση',exact:true}).click();assert.equal(await text.count(),0);
 await prior.getByRole('button',{name:'Επεξεργασία',exact:true}).click();await prior.getByRole('button',{name:'Υπαγόρευση',exact:true}).click();await prior.getByRole('button',{name:'Τέλος υπαγόρευσης',exact:true}).waitFor();await page.waitForTimeout(1200);await prior.getByRole('button',{name:'Τέλος υπαγόρευσης',exact:true}).click();await page.waitForFunction(()=>document.querySelector('textarea')?.value.includes('Συνθετική υπαγόρευση'));await prior.getByRole('button',{name:'Αποθήκευση πορείας',exact:true}).click();await prior.getByRole('button',{name:'Επεξεργασία',exact:true}).waitFor();await check(page,'prior-dictation',size);
 assert.deepEqual(await sql('select id from demo_sessions where patient_id=$1',[patient.id]),[]);assert.deepEqual(await sql('select id from demo_medications where patient_id=$1',[patient.id]),[]);
 await page.goto(origin+'/psychometrics');await page.getByRole('heading',{name:'Βιβλιοθήκη',exact:true}).waitFor();await check(page,'library',size);
 const gadCard=page.locator('article[aria-label="Προεπισκόπηση GAD-7"]');await gadCard.locator('button[title="Email"]').click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Νέος ασθενής',exact:true}).click();await dialog.getByLabel('Όνομα *',{exact:true}).fill('Synthetic');await dialog.getByLabel('Επώνυμο *',{exact:true}).fill('Selective '+size);await dialog.getByLabel('Email παραλήπτη',{exact:true}).fill('synthetic-'+size+'@example.invalid');
 const beforePatients=(await sql('select count(*)::int n from demo_patients where tester_id=$1',[workspace]))[0].n;const beforeAssignments=assignments.length;failNextMail=true;await dialog.getByRole('button',{name:'Αποστολή email',exact:true}).click();await dialog.getByRole('alert').waitFor();await dialog.getByRole('button',{name:'Επανάληψη ίδιας αποστολής',exact:true}).click();await dialog.getByRole('link',{name:'Άνοιγμα έτοιμου email'}).waitFor();assert.equal(assignments.length,beforeAssignments+1);assert.equal(mailAttempts.at(-1).intake_id,mailAttempts.at(-2).intake_id);assert.equal((await sql('select count(*)::int n from demo_patients where tester_id=$1',[workspace]))[0].n,beforePatients);await check(page,'new-patient-email',size);
 const assignment=assignments.at(-1).response;await page.goto(origin+'/intake#'+assignment.intakeToken);await page.getByLabel('Όνομα *',{exact:true}).waitFor();await page.getByLabel('Όνομα *',{exact:true}).fill('Synthetic');await page.getByLabel('Επώνυμο *',{exact:true}).fill('Selective '+size);await page.getByLabel(/Κινητό/).fill(size==='desktop'?'+302101234561':'+302101234562');await page.getByLabel(/Διεύθυνση/).fill('Synthetic address');await page.getByRole('button',{name:'Συνέχεια',exact:true}).click();
 const questions=page.locator('.intake-psych-q');const count=await questions.count();assert.equal(count,7);for(let i=0;i<count;i++)await questions.nth(i).getByRole('radio').nth(1).check();await page.getByRole('button',{name:'Υποβολή',exact:true}).click();await page.locator('.intake-finished').waitFor();await check(page,'questionnaire-submitted',size);
 assert.equal((await sql('select count(*)::int n from demo_patients where tester_id=$1',[workspace]))[0].n,beforePatients+1);const intake=(await sql('select patient_id,status from private.demo_intakes where id=$1',[assignment.intake.id]))[0];assert.equal(intake.status,'submitted');assert.ok(intake.patient_id);assert.deepEqual(await sql('select id from demo_sessions where patient_id=$1',[intake.patient_id]),[]);assert.deepEqual(await sql('select id from demo_calendar_events where patient_id=$1',[intake.patient_id]),[]);
 const beforePrint=assignments.length;await page.goto(origin+'/psychometrics');await page.locator('article[aria-label="Προεπισκόπηση PHQ-9"]').locator('button[title=" Εκτύπωση"]').click();const printDialog=page.getByRole('dialog');await printDialog.getByRole('combobox').fill('Ira');await printDialog.getByRole('option',{name:'Ira Pira'}).click();const popupPromise=page.waitForEvent('popup');await printDialog.getByRole('button',{name:'Εκτύπωση',exact:true}).click();const printed=await popupPromise;await printed.locator('.print-assignment-code').waitFor();assert.equal(assignments.length,beforePrint+1);assert.ok((await printed.locator('.print-assignment-code').textContent()).includes(assignments.at(-1).response.intake.id.slice(0,8).toUpperCase()));assert.equal(assignments.at(-1).request.patient_id,patient.id);await check(printed,'coded-print',size);await printed.close();
 assert.deepEqual(errors,[]);await context.close();
}assert.equal(transcriptions,2);writeFileSync(resolve(out,'report.json'),JSON.stringify({scope:'Actual React, actual intake/prior-course routes, real migrated PGlite; synthetic auth/read transport, synthetic email/transcription. No hosted writes.',results,transcriptions,assignments:assignments.length,mailAttempts:mailAttempts.length},null,2));
}catch(error){writeFileSync(resolve(out,'failure.txt'),String(error.stack||error));throw error}finally{await browser.close();await new Promise(r=>server.close(r));await queue;await db.close()}
