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
 state=structuredClone(seed);requests=[];completionMode='ok';state.clinical_day=day();
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
 if(body.action==='list'||body.action==='mark_viewed')return {intakes:[]};
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
 throw new Error('Unexpected synthetic action: '+body.action);
}
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  try{
   if(url.pathname.includes('summary')){res.statusCode=503;return res.end(JSON.stringify({error:'Synthetic AI disabled'}))}
   if(req.method!=='GET'){let raw='';for await(const chunk of req)raw+=chunk;return res.end(JSON.stringify(handle(JSON.parse(raw||'{}'))))}
   if(url.pathname==='/api/intake')return res.end(JSON.stringify({intakes:[]}));
   if(url.pathname.includes('medications/search'))return res.end(JSON.stringify({items:[]}));
   const sid=url.searchParams.get('session');return res.end(JSON.stringify({bundle:sid?{...state,sessions:state.sessions.filter(s=>s.id===sid)}:state}));
  }catch(e){res.statusCode=409;return res.end(JSON.stringify({error:e.message}))}
 }
 if(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'){res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(readFileSync(resolve(out,url.pathname.slice(1))))}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});const results=[];
try{
 for(const [size,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})){
  async function check(name,fn){
   reset();const context=await browser.newContext({viewport});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
   const open=async query=>{await page.goto(`${origin}/patients/demo/${patientId}${query}`);await page.locator('.patient-hero h1').waitFor();assert.equal(await page.locator('.patient-hero h1').innerText(),'Ira Pira');await page.locator('nav[aria-label="Καρτέλες φακέλου"]').waitFor()};
   const nav=name=>page.getByRole('navigation',{name:'Καρτέλες φακέλου'}).getByRole('button',{name,exact:true});
   try{await fn({page,open,nav});assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no page-level horizontal overflow');await page.screenshot({path:resolve(out,`${size}-${name}.png`)});results.push({name,size,status:'passed'});console.log('PASS',size,name)}
   catch(e){await page.screenshot({path:resolve(out,`${size}-${name}-failed.png`)}).catch(()=>{});writeFileSync(resolve(out,`${size}-${name}-dom.txt`),await page.locator('body').innerText());results.push({name,size,status:'failed',error:e.message,errors});console.error('FAIL',size,name,e.message)}
   finally{await context.close()}
  }
  await check('journey-tabs-date-and-previous-context',async({page,open,nav})=>{
   await open('?tab=summary');
   const navigation=page.getByRole('navigation',{name:'Καρτέλες φακέλου'});
   for(const label of ['Σύνοψη','Επισκέψεις','Θεραπευτικό πλάνο','Στοιχεία & ιστορικό'])assert.equal(await navigation.getByRole('button',{name:label,exact:true}).count(),1);
   assert.equal(await navigation.getByRole('button').count(),4);
   await page.getByRole('region',{name:'Προσανατολισμός φακέλου'}).waitFor();
   assert.equal(await page.getByText('Αναλυτική κλινική σύνθεση και πηγές',{exact:true}).count(),1);
   await page.locator('.patient-voice-cta').click();await page.locator('.patient-visit-surface:not([hidden])').waitFor();
   assert.equal(await page.locator('dialog[open]').count(),0);
   await page.getByRole('complementary',{name:'Προηγούμενη επιβεβαιωμένη εικόνα'}).waitFor();
   assert.equal(new URL(page.url()).searchParams.get('session'),visitId);
   await nav('Στοιχεία & ιστορικό').click();await nav('Σύνοψη').click();
   await page.locator('.patient-voice-cta').click();
   assert.equal(new URL(page.url()).searchParams.get('session'),visitId);
   assert.equal(requests.filter(r=>r.action==='start_session'||r.action==='finalize_session').length,0);
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
   await page.getByRole('button',{name:'Κλείσιμο καταγραφής και επιστροφή στον φάκελο',exact:true}).click();await nav('Σύνοψη').click();await page.getByRole('button',{name:/Συνέχεια πρόχειρης επίσκεψης/}).click();await text.waitFor();assert.match(await text.inputValue(),/QA CURRENT VISIT/);assert.equal(new URL(page.url()).searchParams.get('session'),visitId);
   await page.reload();await text.waitFor();assert.match(await text.inputValue(),/QA CURRENT VISIT/);assert.equal(requests.filter(r=>r.action==='start_session').length,0);
  });
  await check('verified-finalization-and-refresh',async({page,open,nav})=>{
   completionMode='malformed';await open(`?tab=record&session=${visitId}`);const beginReview=page.getByRole('button',{name:'Έλεγχος πριν την ολοκλήρωση',exact:true});await beginReview.waitFor();await beginReview.click();const finish=page.getByRole('button',{name:'Οριστικοποίηση επίσκεψης',exact:true});await finish.waitFor();assert.equal(requests.filter(r=>r.action==='finalize_session').length,0,'review does not finalize');await finish.click();
   await page.getByRole('alert').filter({hasText:'Δεν επιβεβαιώθηκε'}).first().waitFor();assert.equal(state.sessions.find(s=>s.id===visitId).status,'draft');assert.equal(await page.getByText('Η καταγραφή οριστικοποιήθηκε.',{exact:true}).count(),0);
   completionMode='ok';await finish.click();await page.locator('.patient-visit-surface:not([hidden])').getByText('Η καταγραφή οριστικοποιήθηκε.',{exact:true}).waitFor();assert.equal(state.sessions.find(s=>s.id===visitId).status,'completed');
   await page.getByRole('button',{name:'Κλείσιμο καταγραφής και επιστροφή στον φάκελο',exact:true}).click();await nav('Επισκέψεις').click();await page.getByRole('heading',{name:'Επισκέψεις',exact:true}).waitFor();const count=state.sessions.filter(s=>s.status==='completed').length;await page.getByRole('button',{name:'Άνοιγμα καταγραφής',exact:true}).nth(count-1).waitFor();assert.equal(await page.getByRole('button',{name:'Άνοιγμα καταγραφής',exact:true}).count(),count);
   await nav('Σύνοψη').click();await page.getByRole('region',{name:'Προσανατολισμός φακέλου'}).getByText(/QA CURRENT VISIT/).first().waitFor();await page.reload();await page.getByRole('region',{name:'Προσανατολισμός φακέλου'}).getByText(/QA CURRENT VISIT/).first().waitFor();assert.equal(requests.filter(r=>r.action==='finalize_session').length,2,'one malformed response and one confirmed commit; reload never resubmits');
  });
  await check('second-medication-isolation',async({page,open})=>{
   await open(`?tab=record&session=${visitId}`);const table=page.locator('[data-visit-part="medication"]');await table.getByRole('button',{name:'Προσθήκη φαρμάκου',exact:true}).click();
   const row=table.locator('.med-new-row');await row.getByRole('combobox',{name:'Φάρμακο',exact:true}).fill('QA SECOND MEDICATION');await row.getByRole('textbox',{name:'Δόση',exact:true}).fill('10');await row.getByRole('button',{name:'Πρωί',exact:true}).click();await row.getByRole('button',{name:'Προσθήκη',exact:true}).click();
   const saved=table.locator('tbody tr').filter({hasText:'QA SECOND MEDICATION'});await saved.waitFor();assert.equal(await saved.locator('input').count(),0,'new medication does not open an effect/history editor');assert.equal(state.medicationSideEffects.some(e=>e.medication_id==='40000000-0000-4000-8000-000000000099'),false);assert.equal(requests.filter(r=>r.action==='medication_start').length,1);
   await page.reload();await table.locator('tbody tr').filter({hasText:'QA SECOND MEDICATION'}).waitFor();assert.equal(await table.locator('.med-new-row').count(),0);
  });
 }
}finally{writeFileSync(resolve(out,'report.json'),JSON.stringify({scope:'Actual React/browser + persistent isolated HTTP fixture; no live credentials, patient data, AI, emails or database writes. Server scoring/RPC tested independently in PGlite.',results},null,2));await browser.close();await new Promise(r=>server.close(r))}
assert.equal(results.filter(r=>r.status==='failed').length,0,JSON.stringify(results.filter(r=>r.status==='failed')));
console.log(`Passed ${results.length} clinical workflow browser checks.`);
