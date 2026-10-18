import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/pending-tasks');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/pending-tasks-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},tsconfigRaw:{compilerOptions:{baseUrl:process.cwd(),paths:{'@/*':['./*']}}}});
const server=createServer((req,res)=>{
 const asset=req.url==='/fixture.js'?'fixture.js':req.url==='/fixture.css'?'fixture.css':null;
 if(asset){res.setHeader('content-type',asset.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(resolve(out,asset)));return}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
const results=[];
async function check(name,width,run){
 const context=await browser.newContext({viewport:{width,height:1000}});
 const page=await context.newPage(),errors=[],external=[],api=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const url=route.request().url();if(!url.startsWith(origin)){external.push(url);return route.abort()}if(url.includes('/api/')){api.push(url);return route.abort()}return route.continue()});
 try{await page.goto(origin);await page.getByRole('dialog',{name:'Εκκρεμότητες',exact:true}).waitFor();await run(page);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(api,[]);results.push({name,status:'passed'})}
 catch(e){results.push({name,status:'failed',error:String(e.stack||e)});await page.screenshot({path:resolve(out,'failure-'+results.length+'.png'),fullPage:true})}
 finally{await context.close()}
}
const dialog=p=>p.getByRole('dialog',{name:'Εκκρεμότητες',exact:true});
const toggle=async(p,name)=>{await p.getByRole('button',{name:'Κλείσιμο',exact:true}).click();await p.getByRole('button',{name,exact:true}).click();await p.getByRole('button',{name:/^Εκκρεμότητες \(/}).click()};
try{
 await check('desktop: same widget, exact visit links and no checkbox for visit-managed work',1280,async p=>{
  assert.equal(await p.locator('.todo-row').count(),3);
  const rows=p.locator('.todo-row').filter({hasText:'Πρόχειρη επίσκεψη'});
  assert.equal(await rows.count(),2);assert.equal(await rows.getByRole('button').count(),0);
  for(let i=0;i<2;i++){const href=await rows.nth(i).getByRole('link').getAttribute('href');assert.match(href,/patients\/demo\/30000000-0000-4000-8000-00000000000[12]\?tab=record&session=40000000-0000-4000-8000-00000000000[12]/)}
  await p.screenshot({path:resolve(out,'desktop.png'),fullPage:true});
 });
 await check('patient search from two letters, deadline, correct file link, completion and undo',1280,async p=>{
  await p.getByRole('textbox',{name:'Νέα εργασία',exact:true}).fill('Έλεγχος απάντησης');
  await p.getByLabel('Ασθενής (προαιρετικά)',{exact:true}).fill('Ά');assert.equal(await p.getByRole('list',{name:'Αποτελέσματα ασθενών'}).count(),0);
  await p.getByLabel('Ασθενής (προαιρετικά)',{exact:true}).fill('Άν');
  await p.getByRole('button',{name:'Άννα Παράδειγμα',exact:true}).click();
  await p.getByLabel('Προθεσμία (προαιρετικά, ώρα Ελλάδας)',{exact:true}).fill('2026-10-20T17:00');
  await p.getByRole('button',{name:'Προσθήκη',exact:true}).click();
  const row=p.locator('.todo-row').filter({hasText:'Έλεγχος απάντησης'});await row.waitFor();
  assert.equal(await row.getByRole('link').getAttribute('href'),'/patients/demo/30000000-0000-4000-8000-000000000002');
  assert.match(await row.innerText(),/Προθεσμία/);
  await row.getByRole('button',{name:'Ολοκλήρωση Έλεγχος απάντησης',exact:true}).click();
  assert.equal(await row.count(),0);
  await p.getByRole('button',{name:'Αναίρεση',exact:true}).click();await row.waitFor();
  assert.equal(await row.getByRole('link').getAttribute('href'),'/patients/demo/30000000-0000-4000-8000-000000000002');
 });
 await check('loading and failed reads never claim there are no tasks; retry recovers snapshot',1280,async p=>{
  await toggle(p,'Προσομοίωση φόρτωσης');await dialog(p).getByText('Φόρτωση εκκρεμοτήτων…',{exact:true}).waitFor();assert.equal(await dialog(p).getByText('Δεν υπάρχουν εκκρεμότητες.',{exact:true}).count(),0);
  await toggle(p,'Αποτυχία φόρτωσης');await dialog(p).getByRole('alert').waitFor();assert.equal(await dialog(p).getByText('Δεν υπάρχουν εκκρεμότητες.',{exact:true}).count(),0);
  await dialog(p).getByRole('button',{name:'Δοκιμή ξανά',exact:true}).click();await p.locator('.todo-row').first().waitFor();
  await toggle(p,'Αποτυχία ανανέωσης');await dialog(p).getByRole('alert').waitFor();assert.equal(await p.locator('.todo-row').count(),3);
 });
 await check('failed save retains typed input; visit finalization removes drafts and preserves manual work',1280,async p=>{
  await toggle(p,'Αποτυχία επόμενης αποθήκευσης');
  const field=p.getByRole('textbox',{name:'Νέα εργασία',exact:true});await field.fill('Να μη χαθεί');
  await p.getByRole('button',{name:'Προσθήκη',exact:true}).click();await dialog(p).getByRole('alert').waitFor();assert.equal(await field.inputValue(),'Να μη χαθεί');
  await p.getByRole('button',{name:'Προσθήκη',exact:true}).click();await p.locator('.todo-row').filter({hasText:'Να μη χαθεί'}).waitFor();
  await toggle(p,'Προσομοίωση καταχώρισης επισκέψεων');
  assert.equal(await p.locator('.todo-row').filter({hasText:'Πρόχειρη επίσκεψη'}).count(),0);assert.equal(await p.locator('.todo-row').count(),2);
 });
 await check('mobile: preserved widget palette, usable controls and no horizontal overflow',390,async p=>{
  await p.getByLabel('Ασθενής (προαιρετικά)',{exact:true}).fill('Άν');await p.getByRole('button',{name:'Άννα Δείγμα',exact:true}).waitFor();
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const colors=await p.evaluate(()=>({input:getComputedStyle(document.querySelector('.todo-compose input')).backgroundColor,optional:getComputedStyle(document.querySelector('.pending-options input')).backgroundColor}));
  assert.equal(colors.input,colors.optional);
  await p.screenshot({path:resolve(out,'mobile.png'),fullPage:true});
 });
}finally{writeFileSync(resolve(out,'report.json'),JSON.stringify({commit:process.env.GITHUB_SHA,scope:'Actual shared PendingTasks component and styles; memory-only fixtures; all API and external network blocked',results},null,2));await browser.close();await new Promise(r=>server.close(r))}
console.log(JSON.stringify(results,null,2));if(results.some(r=>r.status!=='passed'))process.exitCode=1;
