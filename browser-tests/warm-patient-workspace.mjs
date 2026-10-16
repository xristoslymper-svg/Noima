// Actual workspace and layout CSS, synthetic responses, no live services or writes.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/warm-patient-workspace');mkdirSync(out,{recursive:true});
const bundle=JSON.parse(readFileSync('browser-tests/fixtures/warm-patient.json','utf8'));
await build({entryPoints:['browser-tests/warm-patient-workspace-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_NOIMA_MOBILE_V2':'"0"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'},plugins:[{name:'synthetic-navigation',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'synthetic-navigation'}));
 b.onLoad({filter:/.*/,namespace:'synthetic-navigation'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='next/link'?"import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}":"export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:u=>location.assign(u),replace:u=>location.replace(u),refresh:()=>location.reload()});"}));
}}]});
let writes=0;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  // These are different endpoint contracts, not interchangeable patient bundles.
  if(url.pathname.includes('summary')){res.statusCode=503;return res.end(JSON.stringify({error:'Synthetic AI disabled'}))}
  if(url.pathname==='/api/intake')return res.end(JSON.stringify({intakes:[]}));
  if(url.pathname==='/api/patients/demo/prior-course'&&req.method==='POST'){
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
    bundle.priorCourse={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',patient_id:bundle.patient.id,tester_id:bundle.patient.tester_id,version:(bundle.priorCourse?.version||0)+1,period_label:body.period_label,content:body.content,created_at:'2026-10-16T09:00:00Z'};
    writes++;return res.end(JSON.stringify({priorCourse:bundle.priorCourse}));
  }
  if(req.method!=='GET'){
   writes++;let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw||'{}');const session=bundle.sessions.find(s=>s.id===body.session_id);
   return res.end(JSON.stringify({session,section:{id:'fixture-section',patient_id:bundle.patient.id,session_id:body.session_id,section_key:body.section_key,document:body.document,content:body.content||'',version:1,updated_at:session?.updated_at}}));
  }
  const sid=url.searchParams.get('session');return res.end(JSON.stringify({bundle:sid?{...bundle,sessions:bundle.sessions.filter(s=>s.id===sid)}:bundle}));
 }
 if(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'){res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(readFileSync(resolve(out,url.pathname.slice(1))));}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});const results=[];
try{for(const [size,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})){
 const context=await browser.newContext({viewport});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>{console.error('BROWSER_PAGEERROR',e.stack||e.message);errors.push(e.message)});page.on('console',m=>{if(m.type()==='error')console.error('BROWSER_CONSOLE_ERROR',m.text())});
 for(const tab of ['summary','timeline','treatment','history','record']){
  await page.goto(`${origin}/patients/demo/${bundle.patient.id}?tab=${tab}${tab==='record'?'&session='+bundle.sessions.at(-1).id:''}`);await page.getByRole('heading',{name:'Ira Pira',exact:true}).waitFor();await page.locator('nav[aria-label="Καρτέλες φακέλου"]').waitFor();if(tab==='record')await page.locator('.visit-workspace').waitFor();
  assert.deepEqual(errors,[],'workspace must remain mounted without browser exceptions');
  const styles=await page.evaluate(()=>{const w=document.querySelector('section.workspace'),nav=document.querySelector('nav[aria-label="Καρτέλες φακέλου"]');if(!w||!nav||!nav.nextElementSibling)throw new Error('Expected patient workspace is missing');return {canvas:getComputedStyle(w).backgroundColor,ink:getComputedStyle(w).color,navigation:getComputedStyle(nav).backgroundColor,surface:getComputedStyle(nav.nextElementSibling).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.equal(styles.canvas,'rgb(248, 245, 239)');assert.equal(styles.ink,'rgb(38, 58, 50)');assert.equal(styles.navigation,'rgba(251, 252, 250, 0.72)');assert.equal(styles.surface,'rgba(251, 252, 250, 0.88)');assert.equal(styles.overflow,false);assert.deepEqual(errors,[]);
  await page.screenshot({path:resolve(out,`${size}-${tab}.png`)});results.push({size,tab,status:'passed',...styles});
 }
 await context.close();
 }

 // Empty-record onboarding: real PatientWorkspace, mocked patient API, zero actual DB writes.
 bundle.sessions=[];bundle.sections=[];bundle.risks=[];bundle.assessments=[];bundle.medications=[];bundle.medicationEvents=[];bundle.medicationSideEffects=[];
 for(const [size,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})){
  bundle.priorCourse=null;
  const context=await browser.newContext({viewport});
  await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${origin}/patients/demo/${bundle.patient.id}?new=1`);
  await page.getByRole('heading',{name:'Πώς θέλετε να ξεκινήσετε;'}).waitFor();
  await page.getByRole('button',{name:/Καταχώριση προηγούμενης πορείας/}).click();
  const form=page.getByRole('heading',{name:'Προηγούμενη κλινική πορεία'});
  await form.waitFor();
  await page.getByRole('textbox',{name:/Διάρκεια προηγούμενης παρακολούθησης/}).fill('περίπου 1 έτος');
  await page.getByRole('textbox',{name:'Κλινική πορεία'}).fill('Παρακολούθηση περίπου ενός έτους για άγχος. Αρχική λειτουργική δυσκολία, σταδιακή βελτίωση και πρόσφατη αϋπνία.');
  await page.getByRole('button',{name:'Αποθήκευση πορείας'}).click();
  await page.getByRole('button',{name:/Νέα επανεξέταση/}).waitFor();
  assert.equal(bundle.sessions.length,0,'prior clinical course must not manufacture a visit');
  assert.ok(bundle.priorCourse?.content.includes('λειτουργική δυσκολία'));
  assert.deepEqual(errors,[],'prior course onboarding must not throw browser errors');
  results.push({size,tab:'prior-course-onboarding',status:'passed'});
  await page.screenshot({path:resolve(out,`${size}-prior-course-onboarding.png`)});
  await context.close();
 }
writeFileSync(resolve(out,'report.json'),JSON.stringify({scope:'Synthetic fixture, actual current components and full layout CSS; no live API verification.',fixtureAutosaveRequests:writes,liveWrites:0,results},null,2));console.log(`Passed ${results.length} patient workspace visual checks; zero live writes.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
