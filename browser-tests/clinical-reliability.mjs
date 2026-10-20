// Real React workspace + browser navigation; isolated persistent HTTP fixtures.
// Database/RPC scoring and isolation are independently tested in database.test.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/clinical-reliability');mkdirSync(out,{recursive:true});
const seed=JSON.parse(readFileSync('browser-tests/fixtures/warm-patient.json','utf8'));
const patientId=seed.patient.id,visitId='20000000-0000-4000-8000-000000000012',assessmentId='30000000-0000-4000-8000-000000000012';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let state,requests,completionMode;
function reset(){
 state=structuredClone(seed);state.intakes=[];state.registry=[{...state.patient,registry_number:1,status:'active',note:'',chief_complaint:'',diagnosis:null}];requests=[];completionMode='ok';state.clinical_day=day();
 state.sessions=state.sessions.filter(s=>s.status==='completed');
 const first=state.sessions[0],now=new Date().toISOString();
 const current={...first,id:visitId,status:'draft',version:20,closure_version:0,closure_draft:null,continuity:null,started_at:now,updated_at:now,completed_at:null};
 state.sessions.push(current);
 state.sections.push(...state.sections.filter(s=>s.session_id===first.id).map(s=>({...s,id:visitId+'-'+s.section_key,session_id:visitId,version:1,updated_at:now,...(s.section_key==='interview'?{content:'QA CURRENT VISIT — synthetic clinical findings only.'}:{})})));
 const risk=state.risks.find(r=>r.session_id===first.id);assert.ok(risk,'seed must include a structured risk assessment');state.risks.push({...risk,session_id:visitId,version:1,updated_at:now});
 state.appointments=[];state.proposals=[];state.addenda=[];state.corrections=[];state.contextRevisions=[];
 state.assessments=[{id:assessmentId,patient_id:patientId,tester_id:state.patient.tester_id,session_id:first.id,appointment_id:null,instrument:'PHQ-9',instrument_version:'1',status:'completed',answers:[1,2,1,2,1,2,1,3,0],score:13,completed_at:now,created_at:now,expires_at:now,reviewed_at:null,item9_review:false,item9_reviewed_at:null,provenance:'patient_link'}];
}
reset();
await build({entryPoints:['browser-tests/warm-patient-workspace-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_NOIMA_MOBILE_V2':'"0"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'},plugins:[{name:'synthetic-navigation',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'synthetic-navigation'}));
 b.onLoad({filter:/.*/,namespace:'synthetic-navigation'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='next/link'?"import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}":"export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:u=>location.assign(u),replace:u=>location.replace(u),refresh:()=>location.reload()});"}));
}}]});
function handle(body){
 requests.push(structuredClone(body));
 const s=state.sessions.find(s=>s.id===body.session_id);
 if(body.action==='list')return {intakes:state.intakes};
 if(body.action==='mark_viewed')return {ok:true};
 if(body.action==='review'){const a=state.assessments.find(a=>a.id===body.id);assert.ok(a);a.reviewed_at=new Date().toISOString();return {assessment:a}}
 if(body.action==='update_patient'){
  assert.equal(body.patient_id,patientId);assert.equal(body.expected_updated_at,state.patient.updated_at);
  const {action,expected_updated_at,patient_id,tester,age,...fields}=body;
  state.patient={...state.patient,...fields,reported_age:age,updated_at:new Date().toISOString()};return {patient:state.patient};
 }
 if(body.action==='save_history'){state.history={...state.history,...body.history,patient_id:patientId,version:(state.history?.version||0)+1};return {history:state.history}}
 if(body.action==='save_section'||body.action==='save_document'){
  assert.ok(s&&s.status==='draft');let section=state.sections.find(x=>x.session_id===s.id&&x.section_key===body.section_key);
  if(!section){section={id:s.id+'-'+body.section_key,patient_id:patientId,session_id:s.id,section_key:body.section_key,version:0,source:'manual'};state.sections.push(section)}
  if(body.document){section.document=body.document;section.content=body.document.fields.map(f=>f.text||'').join('\n')}else section.content=body.content;
  section.version++;section.updated_at=new Date().toISOString();return {section};
 }
 if(body.action==='save_risk'){assert.ok(s);const r=state.risks.find(x=>x.session_id===s.id);Object.assign(r,body.risk,{version:r.version+1});return {risk:r}}
 if(body.action==='finalize_session'){
  assert.ok(s);assert.equal(body.expected_version,s.version);
  if(completionMode==='malformed')return {session:{...s}};
  Object.assign(s,{status:'completed',version:s.version+1,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()});return {session:s};
 }
 if(body.action==='medication_start'){
  const m={id:'40000000-0000-4000-8000-000000000099',patient_id:patientId,medication_name:body.name,dose:body.dose,unit:body.unit,frequency:body.frequency,started_at:body.effective_on,effective_from:body.effective_on,ended_at:null,status:'active',plan_version:1,notes:'',updated_at:new Date().toISOString()};state.medications.push(m);return {medication:m};
 }
 if(['medication_event','medication_stop','medication_history','medication_side_effect'].includes(body.action)){
  if(body.session_id)assert.ok(state.sessions.some(s=>s.id===body.session_id&&s.status==='draft'&&s.patient_id===patientId),'only the explicitly selected available draft may receive a write');
  if(body.action==='medication_side_effect'){const effect={id:crypto.randomUUID(),patient_id:patientId,medication_id:body.medication_id,session_id:body.session_id,effect_text:body.effect,severity:body.severity,noted_on:body.noted_on,resolved_on:null,created_at:new Date().toISOString()};state.medicationSideEffects.push(effect);return {side_effect:effect}}
  if(body.action==='medication_history')return {medication:{id:crypto.randomUUID()}};
  const m=state.medications.find(m=>m.id===body.medication_id);assert.ok(m);
  const before={medication_name:m.medication_name,dose:m.dose,unit:m.unit,frequency:m.frequency};
  const stopped=body.action==='medication_stop';
  if(stopped)m.status='stopped';else Object.assign(m,{dose:body.dose,unit:body.unit,frequency:body.frequency});
  m.plan_version++;
  state.medicationEvents.push({id:crypto.randomUUID(),patient_id:patientId,medication_id:m.id,session_id:body.session_id,event_type:stopped?'stopped':'changed',previous_state:before,new_state:{...before,dose:m.dose},effective_on:body.effective_on,reason:body.reason,created_at:new Date().toISOString()});
  return {medication:m};
 }
 throw new Error('Unexpected synthetic action: '+body.action);
}
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  try{
   if(url.pathname.includes('summary')){res.statusCode=503;return res.end(JSON.stringify({error:'Synthetic AI disabled'}))}
   if(req.method!=='GET'){let raw='';for await(const chunk of req)raw+=chunk;return res.end(JSON.stringify(handle(JSON.parse(raw||'{}'))))}
   if(url.pathname==='/api/patients/demo/runtime'&&!url.searchParams.has('patient'))return res.end(JSON.stringify({patients:state.registry}));
   if(url.pathname==='/api/calendar/events')return res.end(JSON.stringify({events:[]}));
   if(url.pathname==='/api/intake')return res.end(JSON.stringify({intakes:[]}));
   if(url.pathname.includes('medications/search'))return res.end(JSON.stringify({items:[]}));
   const sid=url.searchParams.get('session');return res.end(JSON.stringify({bundle:sid?{...state,sessions:state.sessions.filter(s=>s.id===sid)}:state}));
  }catch(e){res.statusCode=409;return res.end(JSON.stringify({error:e.message}))}
 }
 if(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'){res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(readFileSync(resolve(out,url.pathname.slice(1))))}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});const results=[],uxFindings=[];
try{
 for(const [size,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})){
  async function check(name,fn){
   reset();const context=await browser.newContext({viewport});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
   const open=async query=>{await page.goto(`${origin}/patients/demo/${patientId}${query}`);await page.locator('.patient-hero h1').waitFor();assert.equal(await page.locator('.patient-hero h1').innerText(),'Ira Pira');await page.locator('nav[aria-label="Καρτέλες φακέλου"]').waitFor()};
   const nav=name=>({click:async()=>{
    if(await page.locator('dialog[open][aria-labelledby="record-dialog-title"]').count()){
     await page.getByRole('button',{name:'Κλείσιμο καταγραφής και επιστροφή στον φάκελο',exact:true}).click();
     await page.locator('dialog[open][aria-labelledby="record-dialog-title"]').waitFor({state:'detached'});
    }
    await page.getByRole('navigation',{name:'Καρτέλες φακέλου'}).getByRole('button',{name,exact:true}).click();
   }});
   try{await fn({page,open,nav});assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no page-level horizontal overflow');await page.screenshot({path:resolve(out,`${size}-${name}.png`)});results.push({name,size,status:'passed'});console.log('PASS',size,name)}
   catch(e){await page.screenshot({path:resolve(out,`${size}-${name}-failed.png`)}).catch(()=>{});writeFileSync(resolve(out,`${size}-${name}-dom.txt`),await page.locator('body').innerText());results.push({name,size,status:'failed',error:e.message,errors});console.error('FAIL',size,name,e.message)}
   finally{await context.close()}
  }
  await check('journey-tabs-date-and-previous-context',async({page,open,nav})=>{
   await open('?tab=summary');
   const navigation=page.getByRole('navigation',{name:'Καρτέλες φακέλου'});
   for(const label of ['Σύνοψη','Επισκέψεις','Θεραπευτικό πλάνο','Στοιχεία & ιστορικό'])assert.equal(await navigation.getByRole('button',{name:label,exact:true}).count(),1);
   assert.equal(await navigation.getByRole('button').count(),4);
   await page.getByRole('region',{name:'Κλινική σύνοψη'}).waitFor();
   assert.equal(await page.getByText('Καταγραφές και πηγές φακέλου',{exact:true}).count(),1);
   await page.locator('.patient-voice-cta').click();await page.getByRole('menuitem',{name:/Ολοκλήρωση σημειώσεων/}).click();await page.locator('.patient-visit-surface:not([hidden])').waitFor();
   assert.equal(await page.locator('dialog[open][aria-labelledby="record-dialog-title"]').count(),1);
   await page.getByRole('complementary',{name:'Προηγούμενη επιβεβαιωμένη εικόνα'}).waitFor();
   assert.equal(new URL(page.url()).searchParams.get('session'),visitId);
   await nav('Στοιχεία & ιστορικό').click();await nav('Σύνοψη').click();
   await page.locator('.patient-voice-cta').click();await page.getByRole('menuitem',{name:/Ολοκλήρωση σημειώσεων/}).click();
   await page.locator('.patient-visit-surface:not([hidden]) .visit-workspace').waitFor();
   assert.equal(new URL(page.url()).searchParams.get('session'),visitId);
   assert.equal(requests.filter(r=>r.action==='start_session'||r.action==='finalize_session').length,0);
  });
  await check('journey-old-draft-and-today-are-explicit-choices',async({page,open})=>{
   const old=new Date(Date.now()-3*86400000).toISOString();state.sessions.find(s=>s.id===visitId).started_at=old;
   state.appointments=[{id:'90000000-0000-4000-8000-000000000015',patient_id:patientId,status:'scheduled',appointment_type:'follow_up',scheduled_start:new Date().toISOString(),scheduled_end:new Date(Date.now()+3000000).toISOString(),session_id:null}];
   await open('?tab=summary');await page.locator('.patient-voice-cta').click();
   const choices=page.getByRole('menu',{name:'Ενέργειες ασθενή'});await choices.waitFor();
   assert.equal(requests.filter(r=>r.action==='start_session').length,0,'opening the choice must not create an encounter');
   assert.match(await choices.innerText(),/Η ανεξάρτητη νέα επίσκεψη δεν έχει ενεργοποιηθεί/);
   await choices.getByRole('menuitem',{name:/Ολοκλήρωση σημειώσεων/}).click();
   await page.locator('.patient-visit-surface:not([hidden]) .visit-workspace').waitFor();
   assert.equal(new URL(page.url()).searchParams.get('session'),visitId);
   assert.equal(state.sessions.find(s=>s.id===visitId).started_at,old);
   assert.equal(requests.filter(r=>r.action==='start_session').length,0);
  });
  await check('exact-assessment-and-explicit-review',async({page,open})=>{
   await open(`?tab=psychometrics&assessment=${assessmentId}`);
   const result=page.locator(`[data-assessment-id="${assessmentId}"]`);await result.waitFor();await result.getByText(/13\s*\/\s*27/).waitFor();
   assert.equal(await result.locator('details').first().getAttribute('open')!==null,true);assert.equal(await result.locator('details p').count(),9);
   assert.equal(state.assessments[0].reviewed_at,null);assert.equal(requests.filter(r=>r.action==='review').length,0);
   await page.reload();await result.getByText(/13\s*\/\s*27/).waitFor();assert.equal(state.assessments[0].reviewed_at,null);
   await result.getByRole('button',{name:'Σήμανση ως ελεγμένο',exact:true}).click();await result.getByText('✓ Ελεγμένο',{exact:true}).waitFor();assert.equal(requests.filter(r=>r.action==='review').length,1);assert.ok(state.assessments[0].reviewed_at);assert.equal(state.assessments[0].item9_reviewed_at,null);
  });
  await check('demographics-save-cancel-navigation',async({page,open,nav})=>{
   await open('?tab=history');await page.getByRole('button',{name:'Επεξεργασία: Κινητό',exact:true}).click();await page.getByLabel('Κινητό',{exact:true}).fill('6900000000');await nav('Σύνοψη').click();
   await page.getByRole('alert').filter({hasText:'Αποθηκεύστε ή ακυρώστε'}).waitFor();assert.equal(requests.filter(r=>r.action==='update_patient').length,0);
   await page.getByRole('button',{name:'Ακύρωση: Κινητό',exact:true}).click();assert.equal(state.patient.phone,'');
   await page.getByRole('button',{name:'Επεξεργασία: Κινητό',exact:true}).click();await page.getByLabel('Κινητό',{exact:true}).fill('6900000001');await page.getByRole('button',{name:'Αποθήκευση: Κινητό',exact:true}).click();await page.locator('.patient-demographics-value').filter({hasText:'6900000001'}).waitFor();
   assert.equal(requests.filter(r=>r.action==='update_patient').length,1);await page.reload();await page.locator('.patient-demographics-value').filter({hasText:'6900000001'}).waitFor();
  });
  await check('record-resume-identity',async({page,open,nav})=>{
   await open(`?tab=record&session=${visitId}`);const text=page.getByRole('textbox',{name:/Λόγος προσέλευσης & παρούσα εικόνα/});await text.waitFor();assert.match(await text.inputValue(),/QA CURRENT VISIT/);
   await page.getByRole('button',{name:'Κλείσιμο καταγραφής και επιστροφή στον φάκελο',exact:true}).click();await nav('Σύνοψη').click();await page.getByRole('button',{name:'Ενέργειες',exact:true}).click();await page.getByRole('menuitem',{name:/Ολοκλήρωση σημειώσεων/}).click();await text.waitFor();assert.match(await text.inputValue(),/QA CURRENT VISIT/);assert.equal(new URL(page.url()).searchParams.get('session'),visitId);
   await page.reload();await text.waitFor();assert.match(await text.inputValue(),/QA CURRENT VISIT/);assert.equal(requests.filter(r=>r.action==='start_session').length,0);
  });
  await check('popup-escape-preserves-unsaved-work-and-resumes-same-visit',async({page,open})=>{
   await open('?tab=record&session='+visitId);
   const dialog=page.locator('dialog[open][aria-labelledby="record-dialog-title"]');
   const field=page.getByRole('textbox',{name:/Λόγος προσέλευσης & παρούσα εικόνα/});await field.waitFor();
   let fail=true;
   await page.route('**/api/patients/demo/runtime',route=>{
    const body=route.request().postDataJSON();
    if(fail&&body?.action?.startsWith('save_'))return route.fulfill({status:503,json:{error:'Synthetic save unavailable'}});
    return route.continue();
   });
   await field.fill('QA MODAL RECOVERY — synthetic only');
   await page.keyboard.press('Escape');
   await dialog.getByRole('alert').filter({hasText:/Synthetic save unavailable/}).first().waitFor();
   assert.equal(await dialog.count(),1);assert.equal(await field.inputValue(),'QA MODAL RECOVERY — synthetic only');
   fail=false;await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
   await page.getByRole('button',{name:'Ενέργειες',exact:true}).click();
   await page.getByRole('menuitem',{name:/Ολοκλήρωση σημειώσεων/}).click();
   await field.waitFor();assert.equal(await field.inputValue(),'QA MODAL RECOVERY — synthetic only');
   await page.reload();await field.waitFor();assert.equal(await field.inputValue(),'QA MODAL RECOVERY — synthetic only');
   assert.equal(new URL(page.url()).searchParams.get('session'),visitId);
   assert.equal(requests.filter(r=>r.action==='start_session'||r.action==='finalize_session').length,0);
  });
  await check('verified-finalization-and-refresh',async({page,open,nav})=>{
   completionMode='malformed';await open(`?tab=record&session=${visitId}`);const beginReview=page.getByRole('button',{name:'Καταχώριση επίσκεψης',exact:true});await beginReview.waitFor();await beginReview.click();const finish=page.getByRole('button',{name:'Καταχώριση επίσκεψης',exact:true});await finish.waitFor();await page.screenshot({path:resolve(out,`${size}-journey-review.png`)});assert.equal(requests.filter(r=>r.action==='finalize_session').length,0,'review does not finalize');await finish.click();
   await page.getByRole('alert').filter({hasText:'Δεν επιβεβαιώθηκε'}).first().waitFor();assert.equal(state.sessions.find(s=>s.id===visitId).status,'draft');assert.equal(await page.getByText('Η καταγραφή οριστικοποιήθηκε.',{exact:true}).count(),0);
   completionMode='ok';await finish.click();await page.getByRole('status').filter({hasText:'Η επίσκεψη καταχωρίστηκε'}).waitFor();await page.locator('dialog[open]').waitFor({state:'detached'});assert.equal(state.sessions.find(s=>s.id===visitId).status,'completed');await page.screenshot({path:resolve(out,`${size}-journey-completion.png`)});
   await nav('Επισκέψεις').click();await page.getByRole('heading',{name:'Επισκέψεις',exact:true}).waitFor();const count=state.sessions.filter(s=>s.status==='completed').length;await page.getByRole('button',{name:'Άνοιγμα καταγραφής',exact:true}).nth(count-1).waitFor();assert.equal(await page.getByRole('button',{name:'Άνοιγμα καταγραφής',exact:true}).count(),count);
   await nav('Σύνοψη').click();await page.getByRole('region',{name:'Κλινική σύνοψη'}).getByText(/QA CURRENT VISIT/).first().waitFor();await page.reload();await page.getByRole('region',{name:'Κλινική σύνοψη'}).getByText(/QA CURRENT VISIT/).first().waitFor();assert.equal(requests.filter(r=>r.action==='finalize_session').length,2,'one malformed response and one confirmed commit; reload never resubmits');
  });
  await check('second-medication-isolation',async({page,open})=>{
   await open(`?tab=record&session=${visitId}`);const table=page.locator('[data-visit-part="medication"]');await table.getByRole('button',{name:'Προσθήκη φαρμάκου',exact:true}).click();
   const row=table.locator('.med-new-row');await row.getByRole('combobox',{name:'Φάρμακο',exact:true}).fill('QA SECOND MEDICATION');await row.getByRole('textbox',{name:'Δόση',exact:true}).fill('10');await row.getByRole('button',{name:'Πρωί',exact:true}).click();await row.getByRole('button',{name:'Προσθήκη',exact:true}).click();
   const saved=table.locator('tbody tr').filter({hasText:'QA SECOND MEDICATION'});await saved.waitFor();assert.equal(await saved.locator('input').count(),0,'new medication does not open an effect/history editor');assert.equal(state.medicationSideEffects.some(e=>e.medication_id==='40000000-0000-4000-8000-000000000099'),false);assert.equal(requests.filter(r=>r.action==='medication_start').length,1);assert.equal(requests.find(r=>r.action==='medication_start').session_id,visitId);assert.equal(await page.locator('[role="dialog"]').count(),0);
   await page.reload();await table.locator('tbody tr').filter({hasText:'QA SECOND MEDICATION'}).waitFor();assert.equal(await table.locator('.med-new-row').count(),0);
  });
  await check('ux-new-folder-received-history-source-boundaries',async({page,open,nav})=>{
   state.sessions=[];state.sections=[];state.risks=[];state.medications=[];state.medicationEvents=[];state.medicationSideEffects=[];state.assessments=[];
   state.intakes=[{id:'70000000-0000-4000-8000-000000000077',status:'submitted',tools:['history'],channel:'email',submitted_at:new Date().toISOString(),history_answers:{reasons:['Άγχος'],duration:'gt1y',current_meds:'yes',current_medication_name:'SYNTHETIC SELF REPORT ONLY',suicide_attempt:'yes',self_harm:'yes'}}];
   await open('?tab=summary');
   const compact=page.getByRole('region',{name:'Ιστορικό ασθενούς',exact:true});await compact.waitFor();
   const summaryText=await compact.innerText();
   assert.match(summaryText,/χωρίς κλινική επιβεβαίωση/);
   assert.equal(state.sessions.length,0);assert.equal(state.medications.length,0);
   assert.equal(requests.some(r=>r.action==='review'||r.action==='save_history'||r.action==='start_session'),false);
   assert.match(summaryText,/Αναφέρει ιστορικό απόπειρας αυτοκτονίας/);
   assert.match(summaryText,/Αναφέρει ιστορικό αυτοτραυματισμού/);
   assert.match(summaryText,/χρειάζεται κλινική συνεκτίμηση/);
   const viewed=page.waitForResponse(response=>response.url().endsWith('/api/intake')&&response.request().postDataJSON()?.action==='mark_viewed');
   await compact.getByRole('button',{name:'Όλες οι απαντήσεις →',exact:true}).click();
   await page.getByRole('region',{name:'Απαντήσεις ιστορικού από ασθενή',exact:true}).waitFor();
   const full=page.getByRole('region',{name:'Απαντήσεις ιστορικού από ασθενή',exact:true});
   assert.match(await full.innerText(),/Αναφέρει ιστορικό απόπειρας/);assert.match(await full.innerText(),/Αναφέρει ιστορικό αυτοτραυματισμού/);
   assert.equal(requests.some(r=>r.action==='review'||r.action==='save_history'),false,'reading history cannot approve or overwrite clinician history');
   await viewed;
   assert.equal(requests.some(r=>r.action==='mark_viewed'),true,'full history records a passive read receipt in the synthetic fixture only');
   await nav('Σύνοψη').click();await compact.waitFor();
   assert.equal(state.sessions.length,0);assert.equal(state.medications.length,0);
  });
  await check('ux-history-list-failure-is-explicit-in-detail',async({page,open,nav})=>{
   await page.route('**/api/intake',async route=>{
    const body=route.request().postDataJSON();if(body?.action==='list')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic unavailable intake service'})});
    return route.continue();
   });
   await open('?tab=summary');
   await page.getByRole('region',{name:'Κλινική σύνοψη'}).waitFor();
   await page.getByRole('alert').filter({hasText:'Δεν φορτώθηκαν οι απαντήσεις ασθενούς.'}).waitFor();
   await nav('Στοιχεία & ιστορικό').click();
   await page.getByRole('alert').filter({hasText:'Δεν φορτώθηκαν οι απαντήσεις ασθενούς.'}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Επανάληψη',exact:true}).count(),1);
   assert.equal(requests.some(r=>r.action==='review'||r.action==='save_history'),false);
  });

  await check('received-history-background-failure-and-recovery',async({page,open})=>{
   state.intakes=[{id:'70000000-0000-4000-8000-000000000078',status:'submitted',tools:['history'],channel:'tablet',submitted_at:new Date().toISOString(),history_answers:{suicide_attempt:'yes',self_harm:'yes'}}];
   await open('?tab=summary');
   const compact=page.getByRole('region',{name:'Ιστορικό ασθενούς',exact:true});
   await compact.getByText('Αναφέρει ιστορικό απόπειρας αυτοκτονίας',{exact:true}).waitFor();
   let fail=true;
   await page.route('**/api/intake',route=>route.request().postDataJSON()?.action==='list'&&fail?route.fulfill({status:503,json:{error:'synthetic unavailable'}}):route.continue());
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await compact.getByRole('alert').waitFor();
   assert.match(await compact.innerText(),/Αναφέρει ιστορικό απόπειρας αυτοκτονίας/);
   assert.match(await compact.innerText(),/τελευταίες διαθέσιμες απαντήσεις/);
   fail=false;
   const recovered=page.waitForResponse(response=>response.url().endsWith('/api/intake')&&response.request().postDataJSON()?.action==='list'&&response.ok());
   await compact.getByRole('button',{name:'Επανάληψη',exact:true}).click();
   await recovered;
   await page.getByRole('alert').filter({hasText:'Δεν φορτώθηκαν οι απαντήσεις ασθενούς.'}).waitFor({state:'detached'});
   await compact.getByText('Αναφέρει ιστορικό αυτοτραυματισμού',{exact:true}).waitFor();
   assert.equal(await compact.getByRole('alert').count(),0);
   assert.equal(requests.some(r=>['review','save_history','mark_viewed'].includes(r.action)),false);
  });
  await check('registry-refresh-preserves-controls-and-recovers',async({page})=>{
   await page.clock.install();
   await page.goto(origin+'/patients');
   await page.locator('.registry-patient-link').filter({hasText:'Ira Pira'}).waitFor();
   await page.getByRole('searchbox',{name:'Αναζήτηση ασθενών'}).fill('Pira');
   await page.getByRole('button',{name:'Ενεργοί',exact:true}).click();
   await page.getByRole('combobox',{name:'Ταξινόμηση'}).selectOption('name');
   state.registry.push({...state.registry[0],id:'10000000-0000-4000-8000-000000000099',first_name:'Synthetic',registry_number:2});
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await page.locator('.registry-patient-link').filter({hasText:'Synthetic Pira'}).waitFor();
   assert.equal(await page.getByRole('searchbox').inputValue(),'Pira');
   assert.equal(await page.getByRole('button',{name:'Ενεργοί',exact:true}).getAttribute('aria-pressed'),'true');
   assert.equal(await page.getByRole('combobox',{name:'Ταξινόμηση'}).inputValue(),'name');
   let fail=true;
   await page.route('**/api/patients/demo/runtime?*',route=>fail?route.fulfill({status:503,json:{error:'synthetic unavailable'}}):route.continue());
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await page.getByRole('alert').waitFor();
   assert.equal(await page.locator('.registry-patient-link').filter({hasText:'Synthetic Pira'}).count(),1);
   fail=false;await page.getByRole('button',{name:'Επανάληψη',exact:true}).click();
   await page.getByRole('alert').waitFor({state:'detached'});
   state.registry.push({...state.registry[0],id:'10000000-0000-4000-8000-000000000098',first_name:'Polling',registry_number:3});
   await page.clock.runFor(60_100);
   await page.locator('.registry-patient-link').filter({hasText:'Polling Pira'}).waitFor();
   assert.equal(requests.length,0,'registry refresh uses reads only');
  });

  await check('synthetic-history-showcase-never-contacts-api',async({page})=>{
   const apiRequests=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests.push(r.url())});
   await page.goto(origin+'/received-history-preview');
   const compact=page.getByRole('region',{name:'Ιστορικό ασθενούς',exact:true});
   await compact.getByText('Αναφέρει ιστορικό απόπειρας αυτοκτονίας',{exact:true}).waitFor();
   await compact.getByRole('button',{name:'Όλες οι απαντήσεις →'}).click();
   const full=page.getByRole('region',{name:'Απαντήσεις ιστορικού από ασθενή',exact:true});
   await full.waitFor();
   await full.getByText('Αναφέρει ιστορικό αυτοτραυματισμού',{exact:true}).waitFor();
   await page.getByRole('navigation',{name:'Ενότητες επίδειξης'}).getByRole('button',{name:'Σύνοψη',exact:true}).click();
   await page.getByText('Σενάρια επίδειξης φόρτωσης',{exact:true}).click();
   await page.getByRole('button',{name:'Αποτυχία αρχικής φόρτωσης',exact:true}).click();
   await page.getByRole('alert').waitFor();
   await page.getByRole('button',{name:'Επανάληψη',exact:true}).click();
   await compact.waitFor();
   await page.getByRole('button',{name:'Αποτυχία ανανέωσης',exact:true}).click();
   await compact.getByRole('alert').waitFor();
   assert.match(await compact.innerText(),/Αναφέρει ιστορικό απόπειρας αυτοκτονίας/);
   await compact.getByRole('button',{name:'Επανάληψη',exact:true}).click();
   await page.getByRole('alert').waitFor({state:'detached'});
   assert.deepEqual(apiRequests,[],'every showcase scenario must remain entirely in memory');
  });

  await check('history-reading-navigation-and-explicit-edit',async({page,open,nav})=>{
   state.history={...state.history,psychiatric_history:'QA COMPLETE HISTORY '+('Ολόκληρη κλινική σημείωση. '.repeat(35))+' END OF HISTORY',version:1};
   await open('?tab=history');
   const sections=page.getByRole('navigation',{name:'Ενότητες στοιχείων και ιστορικού'});
   await sections.getByRole('link',{name:'Στοιχεία ασθενή',exact:true}).waitFor();
   const positions=await page.evaluate(()=>({details:document.querySelector('.patient-demographics').getBoundingClientRect().top,reported:document.querySelector('[aria-label="Αυτοαναφορές ασθενούς"]').getBoundingClientRect().top}));
   assert.ok(positions.details<positions.reported,'patient details precede unbounded returned histories');
   await sections.getByRole('link',{name:'Κλινικό ιστορικό',exact:true}).click();
   await page.locator('.patient-doctor-notes>summary').click();
   await page.getByText(/QA COMPLETE HISTORY/).waitFor();
   assert.equal(await page.getByRole('textbox',{name:'Ψυχιατρικό ιστορικό',exact:true}).count(),0,'read mode does not expose editing controls');
   assert.match(await page.locator('.patient-doctor-notes').innerText(),/END OF HISTORY/);
   assert.equal(requests.some(r=>r.action==='save_history'),false);
   await page.getByRole('button',{name:'Επεξεργασία κλινικού ιστορικού',exact:true}).click();
   await page.getByRole('textbox',{name:'Ψυχιατρικό ιστορικό',exact:true}).fill('QA EDITED HISTORY — preserved across navigation');
   await page.getByRole('button',{name:'Αποθήκευση σημειώσεων',exact:true}).click();
   await page.getByRole('button',{name:'Επεξεργασία κλινικού ιστορικού',exact:true}).waitFor();
   assert.equal(state.history.psychiatric_history,'QA EDITED HISTORY — preserved across navigation');
   await nav('Σύνοψη').click();await page.getByRole('region',{name:'Κλινική σύνοψη',exact:true}).waitFor();await nav('Στοιχεία & ιστορικό').click();
   await page.locator('.patient-doctor-notes>summary').click();
   await page.getByText('QA EDITED HISTORY — preserved across navigation',{exact:true}).waitFor();
  });
  await check('brief-summary-keeps-provenance-secondary-and-sources-distinct',async({page,open})=>{
   const approved=state.sessions.filter(s=>s.status==='completed').slice(0,2);
   for(const s of approved)s.continuity={...s.continuity,approved_at:s.completed_at,approved_by:'synthetic',pinned_context:'QA SAME ACTIVE CONTEXT'};
   await open('?tab=summary');
   const brief=page.getByRole('region',{name:'Κλινική σύνοψη',exact:true});await brief.waitFor();
   await brief.getByText('Δες καρτέλα',{exact:true}).waitFor();
   const records=page.getByText('Καταγραφές και πηγές φακέλου',{exact:true});
   assert.equal(await page.locator('details').filter({has:records}).getAttribute('open'),null);
   assert.equal(requests.some(r=>r.action==='save_history'||r.action==='revise_context'),false);
   await records.click();
   const group=page.locator('[data-context-group]').filter({hasText:'QA SAME ACTIVE CONTEXT'});
   assert.equal(await group.count(),1);
   assert.equal(await group.getByText('QA SAME ACTIVE CONTEXT',{exact:true}).count(),2,'both source rows remain in the DOM');
   assert.equal(await group.getByText('QA SAME ACTIVE CONTEXT',{exact:true}).first().isVisible(),true);
   assert.equal(await group.getByText('QA SAME ACTIVE CONTEXT',{exact:true}).last().isVisible(),false);
   await group.locator('summary').click();
   assert.equal(await group.getByText('QA SAME ACTIVE CONTEXT',{exact:true}).last().isVisible(),true);
  });

  await check('verified-synthesis-is-primary-with-one-provenance-footer',async({page,open})=>{
   const summaryRequests=[];
   const source={id:'section:synthetic',kind:'session_section',target:'record',session_id:state.sessions[0].id,record_id:'synthetic',label:'QA SOURCE — available only on request',content:'Synthetic supporting evidence'};
   const findings=Array.from({length:5},(_,i)=>({key:'synthesis-'+i,origin:'synthesis',text:'QA SYNTHESIS '+i+': Αναφέρει μικρότερη δυσκολία στην καθημερινότητα.',source_ids:[source.id]}));
   await page.route('**/api/clinical/summary*',route=>{
    summaryRequests.push(route.request().method());
    return route.fulfill({json:{card:{date:state.sessions[0].started_at,synthesized:true,notes:[],sources:[source]},findings,mode:'synthesis',context_hash:'fixture'}});
   });
   await open('?tab=summary');
   const brief=page.getByRole('region',{name:'Κλινική σύνοψη',exact:true});
   await brief.getByText(findings[0].text,{exact:true}).waitFor();
   assert.equal(await brief.locator('footer>details>summary').count(),1);
   assert.equal(await brief.getByRole('link',{name:source.label,exact:true}).isVisible(),false);
   assert.equal(await brief.getByText(findings[4].text,{exact:true}).isVisible(),false);
   await brief.getByText('Πλήρης σύνθεση',{exact:true}).click();
   assert.equal(await brief.getByText(findings[4].text,{exact:true}).isVisible(),true);
   await brief.getByText('Δες καρτέλα',{exact:true}).click();
   assert.equal(await brief.getByRole('link',{name:source.label,exact:true}).isVisible(),true);
   assert.ok(summaryRequests.length>0);assert.ok(summaryRequests.every(m=>m==='GET'));
  });


  await check('copilot-preview-binds-visible-chart-and-keeps-actions-disabled',async({page})=>{
   const calls=[];const clinicalRequests=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/patients/'))clinicalRequests.push(r.url())});
   await page.route('**/api/copilot/synthetic',async route=>{
    const body=route.request().postDataJSON();calls.push(body);
    assert.equal(body.chart,'treatment');assert.equal(body.patient_id,undefined);assert.equal(body.bundle,undefined);
    const events=[{type:'meta',patient:{id:patientId,first_name:'Ira',last_name:'Pira'}},{type:'delta',text:'QA συνθετική αγωγή.'},{type:'done',answer:'QA συνθετική αγωγή.',conversation:'qa-conversation'}];
    await route.fulfill({contentType:'text/event-stream',body:events.map(e=>'data: '+JSON.stringify(e)+String.fromCharCode(10,10)).join('')});
   });
   await page.goto(origin+'/patients/demo/treatment-preview?tab=timeline');
   await page.getByRole('button',{name:'Βοηθός Ψ',exact:true}).click();
   const chat=page.getByRole('region',{name:'Συνομιλία με τον Βοηθό Ψ'});
   await chat.getByText('Ira Pira',{exact:true}).waitFor();
   assert.equal(await chat.getByRole('button',{name:'Ενέργεια',exact:true}).count(),0);
   await chat.getByRole('button',{name:'Ποια είναι η καταγεγραμμένη αγωγή;',exact:true}).click();
   await chat.getByText('QA συνθετική αγωγή.',{exact:true}).waitFor();
   const input=chat.getByRole('textbox',{name:'Μήνυμα στον Βοηθό Ψ'});await input.fill('Και η τελευταία επίσκεψη;');
   await chat.getByRole('button',{name:'Αποστολή ερώτησης'}).click();
   await chat.getByText('QA συνθετική αγωγή.',{exact:true}).nth(1).waitFor();
   assert.equal(calls.length,2);assert.equal(calls[1].conversation,'qa-conversation');
   await chat.getByRole('button',{name:'Νέα συζήτηση',exact:true}).click();
   await chat.getByRole('heading',{name:'Τι θα ήθελες να δούμε;'}).waitFor();
   assert.deepEqual(clinicalRequests,[]);assert.equal(requests.length,0);
   await page.screenshot({path:resolve(out,size+'-copilot-preview.png')});
  });
  await check('visit-filters-preview-allows-reading-without-enabling-writes',async({page})=>{
   const clinicalRequests=[];page.on('request',r=>{if(['/api/patients','/api/clinical','/api/intake','/api/psychometrics'].some(prefix=>new URL(r.url()).pathname.startsWith(prefix)))clinicalRequests.push(r.url())});
   await page.goto(origin+'/timeline-preview?tab=timeline');const filters=page.getByLabel('Φίλτρα πορείας');
   await filters.getByRole('button',{name:'Με αλλαγές αγωγής',exact:true}).click();
   assert.equal(await filters.getByRole('button',{name:'Με αλλαγές αγωγής',exact:true}).getAttribute('aria-pressed'),'true');
   await filters.getByRole('button',{name:'Με μετρήσεις',exact:true}).click();
   await filters.getByRole('button',{name:'Όλες οι επισκέψεις',exact:true}).click();
   const actions=page.locator('[data-visit-row] button');
   assert.ok(await actions.count()>0);for(const action of await actions.all())assert.equal(await action.isEnabled(),false);
   assert.deepEqual(clinicalRequests,[]);assert.equal(requests.length,0);
  });
  await check('visit-filters-keep-exact-links-and-independent-records',async({page,open})=>{
   const approved=state.sessions.filter(s=>s.status==='completed');const target=approved[0],other=approved[1];
   state.medicationEvents=[{id:'qa-linked-change',patient_id:patientId,medication_id:state.medications[0].id,session_id:target.id,event_type:'changed',effective_on:target.started_at.slice(0,10),created_at:target.started_at,previous_state:{dose:50,unit:'mg'},new_state:{dose:100,unit:'mg'}}];
   state.medicationRevisions=[];state.medicationSideEffects=[];
   const template=state.assessments.find(a=>a.status==='completed');
   state.assessments=[{...template,id:'qa-linked-measurement',patient_id:patientId,session_id:other.id,appointment_id:null},{...template,id:'qa-independent-measurement',patient_id:patientId,session_id:null,appointment_id:null}];
   await open('?tab=timeline');const filters=page.getByLabel('Φίλτρα πορείας');assert.equal(await filters.getByRole('button').count(),3);
   const all=filters.getByRole('button',{name:'Όλες οι επισκέψεις',exact:true});
   const rows=page.locator('[data-visit-row]');assert.equal(await rows.count(),state.sessions.length);
   const independent=page.locator('[data-unlinked-events]');await independent.locator('summary').click();await independent.getByText(/Ολοκληρωμένη μέτρηση/).waitFor();
   await filters.getByRole('button',{name:'Με αλλαγές αγωγής',exact:true}).click();
   assert.equal(await rows.count(),1);assert.equal(await rows.first().getAttribute('data-session-id'),target.id);
   assert.equal(await page.locator('[data-treatment-event="med-qa-linked-change"]').count(),1);
   assert.equal(await rows.locator('[data-assessment-id]').count(),0);assert.equal(await independent.count(),1);assert.equal(await independent.getAttribute('open'),'');
   await filters.getByRole('button',{name:'Με μετρήσεις',exact:true}).click();
   assert.equal(await rows.count(),1);assert.equal(await rows.first().getAttribute('data-session-id'),other.id);
   assert.equal(await rows.locator('[data-treatment-event]').count(),0);assert.equal(await rows.locator('[data-assessment-id="qa-linked-measurement"]').count(),1);
   assert.equal(await independent.count(),1);await all.click();assert.equal(await rows.count(),state.sessions.length);assert.equal(requests.length,0);
   await page.screenshot({path:resolve(out,size+'-visit-filters.png')});
  });
  await check('visit-filters-explain-missing-links-and-return-to-all',async({page,open})=>{
   state.medicationEvents=[];state.medicationSideEffects=[];state.assessments=[];
   await open('?tab=timeline');const filters=page.getByLabel('Φίλτρα πορείας');
   await filters.getByRole('button',{name:'Με αλλαγές αγωγής',exact:true}).click();
   const status=page.getByRole('status').filter({hasText:'Δεν υπάρχουν επισκέψεις με συνδεδεμένες αλλαγές αγωγής ή παρενέργειες.'});await status.waitFor();
   assert.equal(await page.locator('[data-visit-row]').count(),0);
   await status.getByRole('button',{name:'Όλες οι επισκέψεις',exact:true}).click();assert.equal(await page.locator('[data-visit-row]').count(),state.sessions.length);
   await filters.getByRole('button',{name:'Με μετρήσεις',exact:true}).click();
   await page.getByText('Δεν υπάρχουν επισκέψεις με συνδεδεμένες ολοκληρωμένες μετρήσεις.',{exact:true}).waitFor();assert.equal(requests.length,0);
  });
  await check('visit-filters-no-visits-keeps-unlinked-results-discoverable',async({page,open})=>{
   const template=state.assessments.find(a=>a.status==='completed');
   state.sessions=[];state.medicationEvents=[];state.medicationSideEffects=[];
   state.assessments=[{...template,id:'qa-independent-only',patient_id:patientId,session_id:null,appointment_id:null}];
   await open('?tab=timeline');
   await page.getByText('Δεν έχουν καταγραφεί επισκέψεις ακόμη.',{exact:true}).waitFor();
   await page.getByText('Οι καταγραφές χωρίς σύνδεση με επίσκεψη παραμένουν διαθέσιμες παρακάτω.',{exact:true}).waitFor();
   const independent=page.locator('[data-unlinked-events]');await independent.locator('summary').click();
   await independent.getByRole('button',{name:'Σκορ και απαντήσεις',exact:true}).waitFor();
   await page.getByLabel('Φίλτρα πορείας').getByRole('button',{name:'Με αλλαγές αγωγής',exact:true}).click();
   assert.equal(await independent.getAttribute('open'),'');await independent.getByRole('button',{name:'Σκορ και απαντήσεις',exact:true}).waitFor();
   assert.equal(requests.length,0);
  });
  await check('treatment-confirmed-plan-and-visit-source',async({page,open})=>{
   const s=state.sessions.filter(s=>s.status==='completed').sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at))[0];
   state.sections=state.sections.filter(x=>x.session_id!==s.id||!['plan','review'].includes(x.section_key));
   state.sections.push({id:'qa-plan',session_id:s.id,section_key:'plan',content:'QA CONFIRMED PLAN',version:1},{id:'qa-review',session_id:s.id,section_key:'review',content:'QA NEXT REVIEW',version:1});
   await open('?tab=treatment');const plan=page.getByRole('region',{name:'Τελευταίο επιβεβαιωμένο πλάνο'});
   await plan.getByText('QA CONFIRMED PLAN',{exact:true}).waitFor();await plan.getByText('QA NEXT REVIEW',{exact:true}).waitFor();
   assert.equal(requests.length,0);
   await plan.getByRole('button',{name:'Άνοιγμα επίσκεψης',exact:true}).click();
   await page.locator('.patient-visit-surface:not([hidden])').waitFor();
   assert.equal(new URL(page.url()).searchParams.get('session'),s.id);
  });
  await check('treatment-contextual-choice-cancel-and-independent-writes',async({page,open})=>{
   const original=state.sessions.find(s=>s.id===visitId);const second={...original,id:'20000000-0000-4000-8000-000000000088',started_at:new Date(Date.now()-86400000).toISOString()};state.sessions.push(second);
   await open('?tab=treatment');
   assert.equal(await page.getByRole('combobox',{name:'Σύνδεση αλλαγών αγωγής με επίσκεψη'}).count(),0);
   const row=page.locator('.medication-lean-table tbody tr').filter({hasText:state.medications[0].medication_name}).first();
   await row.getByRole('button',{name:'Τροποποίηση',exact:true}).click();
   const dose=row.getByRole('textbox',{name:'Δόση '+state.medications[0].medication_name,exact:true});await dose.fill('75');
   await row.getByRole('button',{name:'Αποθήκευση',exact:true}).click();
   const dialog=page.getByRole('dialog');const choice=dialog.getByRole('combobox',{name:'Καταχώριση αλλαγής αγωγής'});
   await choice.waitFor();assert.equal(requests.length,0);assert.equal(await choice.inputValue(),'');
   await choice.selectOption(second.id);await page.keyboard.press('Escape');
   await dialog.waitFor({state:'detached'});assert.equal(await dose.inputValue(),'75');assert.equal(requests.length,0);
   await row.getByRole('button',{name:'Αποθήκευση',exact:true}).click();await choice.selectOption(second.id);
   await dialog.getByRole('button',{name:'Αποθήκευση αλλαγής',exact:true}).click();
   await row.getByRole('button',{name:'Τροποποίηση',exact:true}).waitFor();
   assert.equal(requests.find(r=>r.action==='medication_event').session_id,second.id);
   await row.getByRole('button',{name:'Διακοπή',exact:true}).click();await row.getByRole('button',{name:'Επιβεβαίωση διακοπής',exact:true}).click();
   await choice.waitFor();assert.equal(await choice.inputValue(),'');
   await dialog.getByRole('button',{name:'Αποθήκευση αλλαγής',exact:true}).click();
   await page.getByText('Παλαιότερη αγωγή',{exact:true}).waitFor();assert.equal(requests.find(r=>r.action==='medication_stop').session_id,null);
  });
  await check('treatment-new-medication-never-infers-an-open-draft',async({page,open})=>{
   await open('?tab=treatment');await page.getByRole('button',{name:'Προσθήκη φαρμάκου',exact:true}).click();
   await page.getByRole('combobox',{name:'Φάρμακο',exact:true}).fill('QA EXPLICIT UNLINKED');
   const row=page.locator('.med-new-row');await row.getByRole('textbox',{name:'Δόση',exact:true}).fill('25');
   await row.getByRole('button',{name:'Πρωί',exact:true}).click();await row.getByRole('button',{name:'Προσθήκη',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(requests.filter(r=>r.action==='medication_start').length,0);
   assert.equal(await dialog.getByRole('combobox',{name:'Καταχώριση αλλαγής αγωγής'}).inputValue(),'');
   await dialog.getByRole('button',{name:'Αποθήκευση αλλαγής',exact:true}).click();await page.getByText('QA EXPLICIT UNLINKED',{exact:true}).waitFor();
   assert.equal(requests.find(r=>r.action==='medication_start').session_id,null);
  });
  await check('treatment-without-drafts-saves-without-a-question',async({page,open})=>{
   state.sessions.filter(s=>s.status==='draft').forEach(s=>s.status='completed');
   await open('?tab=treatment');
   const row=page.locator('.medication-lean-table tbody tr').filter({hasText:state.medications[0].medication_name}).first();
   await row.getByRole('button',{name:'Τροποποίηση',exact:true}).click();
   await row.getByRole('textbox',{name:'Δόση '+state.medications[0].medication_name,exact:true}).fill('75');
   await row.getByRole('button',{name:'Αποθήκευση',exact:true}).click();await row.getByRole('button',{name:'Τροποποίηση',exact:true}).waitFor();
   assert.equal(await page.getByRole('dialog').count(),0);assert.equal(requests.find(r=>r.action==='medication_event').session_id,null);
  });
  await check('treatment-side-effect-attribution-is-per-save',async({page,open})=>{
   await open('?tab=treatment');const row=page.locator('.medication-lean-table tbody tr').filter({hasText:state.medications[0].medication_name}).first();
   await row.getByRole('button',{name:'Καταγραφή ανεπιθύμητης ενέργειας',exact:true}).click();
   await row.getByRole('textbox',{name:'Νέα παρενέργεια — '+state.medications[0].medication_name,exact:true}).fill('QA LINKED EFFECT');
   await row.getByRole('combobox',{name:'Βαρύτητα — '+state.medications[0].medication_name,exact:true}).selectOption('mild');
   await row.locator('.med-inline-effect .primary').click();
   const dialog=page.getByRole('dialog');await dialog.getByRole('combobox',{name:'Καταχώριση αλλαγής αγωγής'}).selectOption(visitId);
   assert.equal(requests.filter(r=>r.action==='medication_side_effect').length,0);
   await dialog.getByRole('button',{name:'Αποθήκευση αλλαγής',exact:true}).click();
   await row.getByText('QA LINKED EFFECT',{exact:true}).waitFor();assert.equal(requests.find(r=>r.action==='medication_side_effect').session_id,visitId);
  });
  await check('treatment-empty-state-and-measurement-source',async({page,open})=>{
   state.medications=[];state.medicationEvents=[];state.medicationSideEffects=[];
   await open('?tab=treatment');await page.getByText('Δεν έχει καταγραφεί τρέχουσα ή προγραμματισμένη αγωγή.',{exact:true}).waitFor();
   assert.equal(await page.locator('.medication-lean-table').count(),0);
   await page.getByRole('button',{name:'Νέα μέτρηση',exact:true}).click();await page.getByRole('button',{name:'Συμπλήρωση από ασθενή',exact:true}).waitFor();
   assert.equal(requests.length,0);
   const score=page.locator('[data-assessment-id="'+assessmentId+'"]');await score.getByText('13 / 27',{exact:false}).waitFor();
  });


  await check('smooth-summary-refresh-is-explicit-and-freshness-is-visible',async({page,open})=>{
   const methods=[];let current='QA CURRENT SYNTHESIS';
   await page.route('**/api/clinical/summary*',route=>{methods.push(route.request().method());return route.fulfill({json:{mode:route.request().method()==='POST'?'synthesis':'canonical',reason:'summary_pending',context_hash:'current',card:{synthesized:route.request().method()==='POST',notes:[{text:'QA CURRENT RECORDED NOTE',source_ids:[]}],sources:[]},findings:[{origin:'synthesis',text:current,source_ids:[]}]}})});
   await open('?tab=summary');const brief=page.getByRole('region',{name:'Κλινική σύνοψη',exact:true});
   await brief.getByText('Ο φάκελος άλλαξε ή δεν υπάρχει σύνθεση· εμφανίζονται τρέχοντα αποσπάσματα.',{exact:true}).waitFor();
   assert.ok(methods.length>0&&methods.every(m=>m==='GET'));
   await brief.getByRole('button',{name:'Ενημέρωση σύνοψης',exact:true}).click();
   await brief.getByText(current,{exact:true}).waitFor();assert.equal(methods.filter(m=>m==='POST').length,1);
  });
  await check('smooth-next-review-keeps-complete-corrected-source',async({page,open})=>{
   const s=state.sessions.filter(s=>s.status==='completed').sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at))[0];
   const text='QA AGREED REVIEW '+('Συνθετικός επανέλεγχος. '.repeat(25))+' QA REVIEW END';
   state.corrections.push({id:'qa-review-correction',session_id:s.id,created_at:new Date().toISOString(),patch:{review:{after:text}}});
   await open('?tab=record&session='+visitId);
   const reference=page.getByRole('complementary',{name:'Προηγούμενη επιβεβαιωμένη εικόνα'});
   await reference.locator('details>summary').first().click();
   await reference.getByText(text,{exact:true}).first().waitFor();assert.match(await reference.innerText(),/QA REVIEW END/);
   assert.equal(requests.filter(r=>r.action==='save_section'||r.action==='save_closure').length,0);
  });

  await check('released-calendar-toolbar-keeps-manual-scheduling',async({page})=>{
   await page.goto(origin+'/calendar');
   await page.getByRole('heading',{name:'Ημερολόγιο',exact:true}).waitFor();
   const toolbar=page.locator('.calendar-date-tools');
   await toolbar.getByRole('button',{name:'+ Νέο ραντεβού',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:/Φωνητική εντολή/}).count(),0);
   assert.equal(await page.locator('.calendar-day-count').count(),0);
   const empty=page.getByText('Δεν υπάρχουν ραντεβού',{exact:false});
   await toolbar.getByRole('button',{name:'+ Νέο ραντεβού',exact:true}).click();
   await page.locator('.calendar-appointment-dialog').waitFor();
   assert.equal(requests.length,0,'opening the existing scheduling form creates nothing');
  });

 }
}finally{writeFileSync(resolve(out,'report.json'),JSON.stringify({scope:'Actual React/browser + persistent isolated HTTP fixture; no live credentials, patient data, AI, emails or database writes. Server scoring/RPC tested independently in PGlite.',results,uxFindings},null,2));await browser.close();await new Promise(r=>server.close(r))}
assert.equal(results.filter(r=>r.status==='failed').length,0,JSON.stringify(results.filter(r=>r.status==='failed')));
console.log(`Passed ${results.length} clinical workflow browser checks.`);
