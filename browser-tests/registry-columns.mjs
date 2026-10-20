// Full registry page, isolated HTTP fixtures, no live credentials or shared database.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {registrySimulation} from '../lib/patients/registry-simulation.ts';
import {defaultRegistryLayout,registryLayoutKey} from '../lib/patients/registry-layout.ts';
const out=resolve('test-results/registry-columns');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/registry-columns-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_NOIMA_MOBILE_V2':'"0"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'},plugins:[{name:'navigation',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'navigation'}));
 b.onLoad({filter:/.*/,namespace:'navigation'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/link'?"import React from 'react';export default function Link({children,...p}){return <a {...p}>{children}</a>}":"export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:u=>location.assign(u),replace:u=>location.replace(u),refresh:()=>location.reload()});"}));
}}]});
let rows=structuredClone(registrySimulation),failed=false,writes=0;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  if(req.method!=='GET'){writes++;res.statusCode=403;return res.end(JSON.stringify({error:'Synthetic writes forbidden'}))}
  if(url.pathname==='/api/patients/demo/runtime'){if(failed){res.statusCode=503;return res.end(JSON.stringify({error:'offline'}))}return res.end(JSON.stringify({patients:rows}))}
  return res.end(JSON.stringify({}));
 }
 if(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'){res.setHeader('content-type',url.pathname.endsWith('css')?'text/css':'text/javascript');return res.end(readFileSync(resolve(out,url.pathname.slice(1))))}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();const report=[];
const ownerA='10000000-0000-4000-8000-000000000001',ownerB='10000000-0000-4000-8000-000000000002';
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'noima-workspace-id',value:ownerA,url:origin}]);
 await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const headers=()=>page.locator('thead th[data-column-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.columnId));
 const open=async()=>{if(!await page.getByRole('region',{name:'Προσαρμογή στηλών',exact:true}).count())await page.getByRole('button',{name:'Στήλες',exact:true}).click()};
 await page.goto(origin+'/patients');await page.locator('[data-patient-id]').first().waitFor();
 assert.deepEqual(await headers(),['registry','name','age','phone','diagnosis','last','next']);
 const firstRow=page.locator('[data-patient-id="'+rows[0].id+'"]');
 assert.equal(await firstRow.locator('.registry-patient-link').innerText(),'Μαρία Δείγμα');
 assert.equal(await firstRow.locator('[data-column-id="age"]').innerText(),'32 ετών');
 assert.equal(await firstRow.locator('[data-column-id="phone"]').innerText(),'6900000001');
 assert.equal(await firstRow.getByText('Συνθετική σημείωση φακέλου',{exact:true}).count(),0);
 assert.equal(await firstRow.getByRole('link',{name:'Νέο ραντεβού για Μαρία Δείγμα',exact:true}).getAttribute('href'),'/calendar?patient='+rows[0].id);
 assert.equal(await firstRow.getByRole('link',{name:'Επεξεργασία στοιχείων Μαρία Δείγμα',exact:true}).getAttribute('href'),'/patients/demo/'+rows[0].id+'?tab=history');
 report.push('professional separate columns preserve exact patient/appointment/edit destinations without duplicate identity text');
 await open();assert.equal(await page.getByRole('checkbox',{name:'Εμφάνιση: Ονοματεπώνυμο',exact:true}).isDisabled(),true);
 await page.getByRole('checkbox',{name:'Εμφάνιση: Ηλικία',exact:true}).uncheck();
 await page.getByRole('checkbox',{name:'Εμφάνιση: Email',exact:true}).check();
 assert.equal((await headers()).includes('age'),false);assert.equal((await headers()).includes('email'),true);
 assert.equal(await firstRow.locator('[data-column-id="email"]').innerText(),'synthetic1@example.invalid');
 await page.getByRole('button',{name:'Μετακίνηση αριστερά: Email',exact:true}).click();
 assert.ok((await headers()).indexOf('email')<(await headers()).indexOf('next'));
 await page.getByRole('button',{name:'Κλείσιμο προσαρμογής στηλών',exact:true}).click();
 await page.locator('th[data-column-id="phone"] button').dragTo(page.locator('th[data-column-id="name"]'));
 assert.ok((await headers()).indexOf('phone')<(await headers()).indexOf('name'),'native header drag reorders the actual table');
 const saved=await headers();await page.reload();await page.locator('[data-patient-id]').first().waitFor();assert.deepEqual(await headers(),saved);
 const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),registryLayoutKey(ownerA));assert.deepEqual(Object.keys(stored),['version','order','hidden']);assert.equal(JSON.stringify(stored).includes('synthetic1'),false);
 report.push('hide/show, keyboard arrows, native drag and refresh preserve scoped column choices without patient data in storage');
 await context.addCookies([{name:'noima-workspace-id',value:ownerB,url:origin}]);await page.reload();await page.locator('[data-patient-id]').first().waitFor();assert.deepEqual(await headers(),defaultRegistryLayout().order.filter(id=>!defaultRegistryLayout().hidden.includes(id)));
 await context.addCookies([{name:'noima-workspace-id',value:ownerA,url:origin}]);await page.reload();await page.locator('[data-patient-id]').first().waitFor();assert.deepEqual(await headers(),saved);
 await open();await page.getByRole('button',{name:'Επαναφορά στηλών',exact:true}).click();await page.getByRole('button',{name:'Κλείσιμο προσαρμογής στηλών',exact:true}).click();
 report.push('owners remain isolated and reset restores defaults without modifying any record');
 await page.getByRole('searchbox',{name:'Αναζήτηση ασθενών',exact:true}).fill('μαρια δειγμα');assert.equal(await page.locator('[data-patient-id]').count(),2);
 await page.getByRole('searchbox',{name:'Αναζήτηση ασθενών',exact:true}).fill('6900000002');assert.equal(await page.locator('[data-patient-id]').count(),1);assert.equal(await page.locator('[data-column-id="age"]').last().innerText(),'35 ετών');
 await page.getByRole('searchbox',{name:'Αναζήτηση ασθενών',exact:true}).fill('not found');
 await page.getByRole('button',{name:'Καθαρισμός αναζήτησης και φίλτρων',exact:true}).click();assert.equal(await page.locator('[data-patient-id]').count(),8);
 await page.getByRole('button',{name:'Μη ολοκληρωμένες',exact:true}).click();assert.equal(await page.locator('[data-patient-id]').count(),3);
 await page.getByRole('button',{name:'Όλοι',exact:true}).click();await page.getByRole('combobox',{name:'Ταξινόμηση',exact:true}).selectOption('name');
 const sortedNames=await page.locator('.registry-patient-link').allTextContents();assert.equal(sortedNames.length,8);
 await page.screenshot({path:resolve(out,'desktop-registry.png'),fullPage:true});
 await page.goto(origin+'/patients?assign=PHQ-9');await page.locator('[data-patient-id]').first().waitFor();assert.match(await page.locator('.registry-patient-link').first().getAttribute('href'),/tab=psychometrics&instrument=PHQ-9/);
 failed=true;await page.reload();await page.getByRole('alert').waitFor();failed=false;await page.getByRole('button',{name:'Επανάληψη',exact:true}).click();await page.locator('[data-patient-id]').first().waitFor();
 report.push('same names, phone search, empty results, filters, sorting, assignment targeting and retry remain functional');
 for(const viewport of [{width:768,height:1024},{width:390,height:844},{width:320,height:844}]){
  await page.setViewportSize(viewport);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('th[data-column-id="next"]').count(),1,'responsive CSS must never silently hide a chosen column');
  const region=page.getByRole('region',{name:'Μητρώο ασθενών',exact:true});await region.focus();await page.keyboard.press('End');
  await open();const box=await page.getByRole('region',{name:'Προσαρμογή στηλών',exact:true}).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=viewport.width+1);
  await page.screenshot({path:resolve(out,'columns-'+viewport.width+'.png'),fullPage:true});
  await page.getByRole('button',{name:'Κλείσιμο προσαρμογής στηλών',exact:true}).click();
 }
 report.push('tablet/mobile retain every selected column in an accessible scroll region; chooser fits 320px');
 rows=Array.from({length:500},(_,i)=>({...registrySimulation[i%8],id:'load-'+i,registry_number:i+1}));await page.reload();await page.locator('[data-patient-id="load-499"]').waitFor();assert.equal(await page.locator('[data-patient-id]').count(),500);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await context.close();
 const broken=await browser.newContext({viewport:{width:390,height:844}});await broken.addCookies([{name:'noima-workspace-id',value:ownerA,url:origin}]);await broken.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await broken.addInitScript(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(k){if(k.startsWith('noima:registry-columns'))throw new Error('blocked');return get.call(this,k)};Storage.prototype.setItem=function(k,v){if(k.startsWith('noima:registry-columns'))throw new Error('blocked');return set.call(this,k,v)}});
 const offline=await broken.newPage();await offline.goto(origin+'/patients');await offline.locator('[data-patient-id]').first().waitFor();await offline.getByRole('button',{name:'Στήλες',exact:true}).click();await offline.getByRole('checkbox',{name:'Εμφάνιση: Email',exact:true}).check();await offline.getByRole('status').filter({hasText:'ισχύει προσωρινά'}).waitFor();assert.equal(await offline.locator('th[data-column-id="email"]').count(),1);
 await broken.close();assert.equal(writes,0);
 report.push('500-row registry and blocked browser storage remain usable; zero write requests');
 writeFileSync(resolve(out,'report.json'),JSON.stringify({tests:report,liveWrites:0,fixtureWrites:writes},null,2));console.log(report.join('\n'));
}finally{await browser.close();await new Promise(r=>server.close(r))}
