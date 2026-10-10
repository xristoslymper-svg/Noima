import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/clinical-editor-cleanup');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/clinical-editor-cleanup-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},tsconfigRaw:{compilerOptions:{baseUrl:process.cwd(),paths:{'@/*':['./*']}}}});
const server=createServer((req,res)=>{
 if(req.url==='/fixture.js'||req.url==='/fixture.css'){res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(resolve(out,req.url.slice(1))));return}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const report={scope:'Actual PatientSession and nested editors/styles with browser-only synthetic API state. No real authentication, provider or patient writes.',tests:[]};
async function scenario(name,viewport,search,run){
 const context=await browser.newContext({viewport});const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});page.setDefaultTimeout(10000);await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 try{await page.goto(origin+search);await page.getByRole('heading',{name:search?'Σημερινή καταγραφή':'Αρχική αξιολόγηση',exact:true}).waitFor();await run(page);assert.deepEqual(errors,[]);report.tests.push({name,status:'passed'})}
 catch(error){report.tests.push({name,status:'failed',error:String(error.stack||error),errors});await page.screenshot({path:resolve(out,name+'-failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1}
 finally{await context.close()}
}
try{
 await scenario('desktop',{width:1366,height:960},'',async p=>{
  assert.equal(await p.evaluate(()=>window.cleanupQA.writes.length),0);
  const provenance=p.locator('.clinical-provenance>summary');assert.equal(await provenance.textContent(),'⌄');assert.equal(await provenance.getAttribute('aria-label'),'Προέλευση επιβεβαιωμένου κειμένου');
  await provenance.focus();await p.keyboard.press('Enter');assert.equal(await p.locator('.clinical-provenance').getAttribute('open'),'');assert.ok(await p.getByText('Αυτούσια συνθετική μεταγραφή.',{exact:false}).isVisible());await p.keyboard.press('Enter');
  const mse=p.locator('[data-visit-part="mse"]');assert.equal(await mse.locator('[data-mse-domain]').count(),12);assert.equal(await mse.locator('[aria-pressed="true"]').count(),0);
  assert.equal(await p.getByText('Οδηγός ενότητας',{exact:true}).count(),0);assert.equal(await mse.getByRole('button',{name:/Δεν αξιολογήθηκε/}).count(),0);
  const colors=await p.locator('[data-writing-editor],.mse-columns').evaluateAll(es=>[...new Set(es.map(e=>getComputedStyle(e).backgroundColor))]);report.colors=colors;assert.deepEqual(colors,['rgb(255, 254, 250)']);
  assert.equal(await p.locator('[data-visit-part="interview"]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  const mood=mse.locator('[data-mse-domain="mood"]');await mood.locator('summary').click();assert.equal(await mood.locator('.mse-body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 254, 250)');await mood.getByRole('button',{name:'Αγχώδες',exact:true}).click();
  await p.waitForFunction(()=>window.cleanupQA.writes.some(w=>w.action==='save_document'));
  const fields=await p.evaluate(()=>window.cleanupQA.bundle.sections.find(s=>s.section_key==='mse').document.fields);assert.ok(fields.find(f=>f.key==='mood').text.includes('Αγχώδες'));assert.ok(fields.filter(f=>f.key!=='mood').every(f=>f.text===''&&f.review==='not_assessed'));
  await mood.locator('summary').click();await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:resolve(out,'desktop.png')});
  await p.locator('.visit-assessment-additional>summary').click();assert.equal(await p.getByText('Διατύπωση περίπτωσης',{exact:true}).count(),0);assert.equal(await p.locator('.visit-assessment-additional').getByText('Παλαιότερη σημείωση δοκιμής — διατηρείται αυτούσια.',{exact:true}).count(),0);
  await p.getByText('Προηγούμενη κλινική σημείωση',{exact:true}).click();assert.ok(await p.getByText('Παλαιότερη σημείωση δοκιμής — διατηρείται αυτούσια.',{exact:true}).isVisible());
  await p.locator('[data-visit-part="assessment"]').screenshot({path:resolve(out,'assessment.png')});
 });
 await scenario('mobile',{width:390,height:844},'',async p=>{
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
  const mic=p.getByRole('button',{name:/Υπαγόρευση: Ψυχιατρική συνέντευξη/});assert.ok(await mic.isVisible());
  await p.screenshot({path:resolve(out,'mobile.png')});
  const mse=p.locator('[data-visit-part="mse"]');await mse.locator('[data-mse-domain="mood"]>summary').click();await mse.getByRole('button',{name:'Αγχώδες',exact:true}).click();await p.waitForFunction(()=>window.cleanupQA.writes.some(w=>w.action==='save_document'));
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'expanded MSE overflow');
 });
 await scenario('followup',{width:1366,height:960},'?followup=1',async p=>{
  const open=p.getByRole('button',{name:'Καταγραφή αλλαγής σε ενότητα MSE',exact:true});await open.click();
  const mood=p.locator('[data-mse-domain="mood"]');assert.equal(await mood.locator('[aria-pressed="true"]').count(),0);
  await mood.locator('summary').first().click();await mood.getByRole('button',{name:'Διατήρηση προηγούμενων & συνέχεια',exact:true}).click();
  await p.waitForFunction(()=>window.cleanupQA.writes.some(w=>w.action==='save_document'));
  const saved=await p.evaluate(()=>window.cleanupQA.bundle.sections.find(s=>s.session_id==='synthetic-current'&&s.section_key==='mse').document.fields.find(f=>f.key==='mood'));
  assert.equal(saved.review,'unchanged');assert.ok(saved.text.includes('Αγχώδες'));await p.screenshot({path:resolve(out,'followup.png')});
 });
}finally{await browser.close();await new Promise(r=>server.close(r));writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
