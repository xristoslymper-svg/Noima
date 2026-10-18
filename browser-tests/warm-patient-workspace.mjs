// Actual workspace and layout CSS, synthetic responses, no live services or writes.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/warm-patient-workspace');mkdirSync(out,{recursive:true});
const bundle=JSON.parse(readFileSync('browser-tests/fixtures/warm-patient.json','utf8'));
// Reproduce a draft-linked start and an explicitly unlinked stop without live writes.
bundle.medicationEvents.push(
 {id:'timeline-draft-start',patient_id:bundle.patient.id,medication_id:bundle.medications[0]?.id||'synthetic-med',session_id:bundle.sessions.at(-1).id,event_type:'started',effective_on:'2026-10-14',created_at:'2026-10-14T12:00:00Z',previous_state:null,new_state:{medication_name:'Synthetic timeline drug',dose:50,unit:'mg'},reason:''},
 {id:'timeline-unlinked-stop',patient_id:bundle.patient.id,medication_id:bundle.medications[0]?.id||'synthetic-med',session_id:null,event_type:'stopped',effective_on:'2026-10-14',created_at:'2026-10-14T11:59:00Z',previous_state:{medication_name:'Synthetic previous drug',dose:100,unit:'mg'},new_state:null,reason:''}
);
bundle.assessments.push(
 {id:'timeline-previous-score',patient_id:bundle.patient.id,appointment_id:null,session_id:bundle.sessions[0].id,instrument:'PHQ-9',instrument_version:'v1',status:'completed',expires_at:'2026-12-01T00:00:00Z',opened_at:null,completed_at:'2026-09-01T11:20:00Z',answers:[2,2,2,2,1,1,1,1,0],score:12,item9_review:false,item9_reviewed_at:null,reviewed_at:null,created_at:'2026-09-01T11:00:00Z'},
 {id:'timeline-current-score',patient_id:bundle.patient.id,appointment_id:null,session_id:bundle.sessions.at(-1).id,instrument:'PHQ-9',instrument_version:'v1',status:'completed',expires_at:'2026-12-01T00:00:00Z',opened_at:null,completed_at:'2026-10-11T09:20:00Z',answers:[1,1,1,1,1,1,1,1,0],score:8,item9_review:false,item9_reviewed_at:null,reviewed_at:null,created_at:'2026-10-11T09:00:00Z'}
);
await build({entryPoints:['browser-tests/warm-patient-workspace-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_NOIMA_MOBILE_V2':'"0"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'},plugins:[{name:'synthetic-navigation',setup(b){
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
try{for(const [size,viewport] of Object.entries({desktop:{width:1440,height:1000},tablet:{width:768,height:1024},mobile:{width:390,height:844},sidebar:{width:320,height:844}})){
 const context=await browser.newContext({viewport});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
 for(const tab of ['summary','timeline','treatment','history','record']){
  await page.goto(`${origin}/patients/demo/${bundle.patient.id}?tab=${tab}${tab==='record'?'&session='+bundle.sessions.at(-1).id:''}`);await page.locator('.patient-hero h1').waitFor();assert.equal(await page.locator('.patient-hero h1').innerText(),'Ira Pira');await page.locator('nav[aria-label="Καρτέλες φακέλου"]').waitFor();if(tab==='record')await page.locator('.patient-visit-surface:not([hidden]) .visit-workspace').waitFor();
  assert.deepEqual(errors,[],'workspace must remain mounted without browser exceptions');
  const styles=await page.evaluate(()=>{const w=document.querySelector('section.workspace'),nav=document.querySelector('nav[aria-label="Καρτέλες φακέλου"]');if(!w||!nav||!nav.nextElementSibling)throw new Error('Expected patient workspace is missing');return {canvas:getComputedStyle(w).backgroundColor,ink:getComputedStyle(w).color,navigation:getComputedStyle(nav).backgroundColor,surface:getComputedStyle(nav.nextElementSibling).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.equal(styles.canvas,'rgb(248, 245, 239)');assert.equal(styles.ink,'rgb(38, 58, 50)');assert.equal(styles.navigation,'rgba(251, 252, 250, 0.72)');assert.equal(styles.surface,'rgba(251, 252, 250, 0.88)');assert.equal(styles.overflow,false);assert.deepEqual(errors,[]);
  {
   const positions=await page.locator('nav[aria-label="Καρτέλες φακέλου"] > button').evaluateAll(buttons=>buttons.map(b=>Math.round(b.getBoundingClientRect().top)));
   assert.equal(positions.length,4);assert.equal(new Set(positions).size,size==='sidebar'?2:1,size+' '+tab+': balanced navigation rows '+positions.join(','));
   for(const label of ['Σύνοψη','Επισκέψεις','Θεραπευτικό πλάνο','Στοιχεία & ιστορικό']){
    const button=page.getByRole('navigation',{name:'Καρτέλες φακέλου'}).getByRole('button',{name:label,exact:true});
    assert.equal(await button.locator('svg').isVisible(),true,label+' retains its visible icon');
    assert.equal(await button.locator('span').last().isVisible(),true,label+' retains its visible label');
   }
   const navBox=await page.locator('nav[aria-label="Καρτέλες φακέλου"]').evaluate(n=>({height:n.getBoundingClientRect().height,top:Math.min(...[...n.querySelectorAll(':scope>button')].map(b=>b.getBoundingClientRect().top)),bottom:Math.max(...[...n.querySelectorAll(':scope>button')].map(b=>b.getBoundingClientRect().bottom))}));
   assert.ok(navBox.height<=navBox.bottom-navBox.top+16,'no reserved second navigation row');
  }
  if(tab==='treatment'&&size!=='desktop'){
   const widths=await page.locator('.medication-table-editor').first().evaluate(e=>({content:e.scrollWidth,available:e.clientWidth}));
   assert.ok(widths.content<=widths.available+1,'treatment medication remains readable without horizontal dragging');
  }
  if(tab==='timeline'){
   const row=page.locator('[data-session-id="'+bundle.sessions.at(-1).id+'"]');
   await row.getByText('Επανεξέταση · Πρόχειρη',{exact:true}).waitFor();
   assert.equal(await row.locator('[data-treatment-event="med-timeline-draft-start"]').count(),1);
   assert.equal(await page.locator('[data-treatment-event="med-timeline-draft-start"]').count(),1,'linked event must not be duplicated');
   assert.ok(await page.locator('[data-assessment-id]').count()>0,'linked measurements stay with visits');
   const unlinked=page.locator('[data-unlinked-events="true"]');
   await unlinked.locator('summary').click();
   assert.equal(await unlinked.getByText('Διακοπή αγωγής',{exact:true}).count(),1);
   assert.equal(await unlinked.getByText('Έναρξη αγωγής',{exact:true}).count(),0);
   await unlinked.locator('summary').click();
   if(size==='desktop'||size==='tablet'){
    const layout=await row.evaluate(n=>{const visit=n.children[1].getBoundingClientRect(),context=n.querySelector('[data-visit-context]').getBoundingClientRect();return{right:context.left>=visit.right,aligned:Math.abs(context.top-visit.top)<2}});
    assert.equal(layout.right,true,'treatment context is right of the visit');
    assert.equal(layout.aligned,true,'visit and context share a row');
   }
   await page.getByRole('button',{name:'Θεραπεία',exact:true}).click();
   assert.equal(await row.locator('[data-treatment-event="med-timeline-draft-start"]').count(),1);
   await page.getByRole('button',{name:'Όλα',exact:true}).click();
  }
  if(tab==='record'){
   assert.equal(await page.locator('.patient-hero .patient-voice-cta').count(),0,'no duplicate start action while writing');
   assert.equal(await page.getByRole('complementary',{name:'Προηγούμενη επιβεβαιωμένη εικόνα'}).locator('details').first().getAttribute('open'),null,'previous context begins collapsed');
  }
  await page.screenshot({path:resolve(out,`${size}-${tab}.png`)});results.push({size,tab,status:'passed',...styles});
 }
 await context.close();
}writeFileSync(resolve(out,'report.json'),JSON.stringify({scope:'Synthetic fixture, actual current components and full layout CSS; no live API verification.',fixtureAutosaveRequests:writes,liveWrites:0,results},null,2));console.log(`Passed ${results.length} patient workspace visual checks; zero live writes.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
