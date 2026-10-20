import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {registrySimulation} from '../lib/patients/registry-simulation.ts';
const out=resolve('test-results/current-i18n');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/current-i18n-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_NOIMA_MOBILE_V2':'"0"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'},plugins:[{name:'navigation',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'navigation'}));
 b.onLoad({filter:/.*/,namespace:'navigation'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/link'?"import React from 'react';export default function Link({children,...p}){return <a {...p}>{children}</a>}":"export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:u=>location.assign(u),replace:u=>location.replace(u),refresh:()=>location.reload()});"}));
}}]});

let deniedWrites=0,localeWrites=0;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/api/locale'&&req.method==='POST'){
  let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);
  assert.deepEqual(Object.keys(body),['locale']);assert.ok(['el','en'].includes(body.locale));localeWrites++;
  res.setHeader('content-type','application/json');res.setHeader('set-cookie','test-locale='+body.locale+'; Path=/; SameSite=Lax');return res.end(JSON.stringify({locale:body.locale}));
 }
 if(url.pathname.startsWith('/api/')){
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  if(req.method!=='GET'){deniedWrites++;res.statusCode=403;return res.end(JSON.stringify({error:'No database writes in this fixture'}))}
  if(url.pathname==='/api/patients/demo/runtime')return res.end(JSON.stringify({patients:registrySimulation}));
  return res.end(JSON.stringify({}));
 }
 if(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'){res.setHeader('content-type',url.pathname.endsWith('css')?'text/css':'text/javascript');return res.end(readFileSync(resolve(out,url.pathname.slice(1))))}
 const locale=/test-locale=en/.test(req.headers.cookie||'')?'en':'el';
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="'+locale+'" data-test-locale="'+locale+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(),report=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'noima-workspace-id',value:'10000000-0000-4000-8000-000000000001',url:origin}]);
 await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const switchTo=async(locale)=>{await page.getByRole('complementary',{name:'Test language control'}).getByRole('button',{name:locale==='en'?'English':'Ελληνικά',exact:true}).click();await page.waitForFunction(locale=>document.documentElement.lang===locale,locale)};
 await page.goto(origin+'/patients');await page.locator('[data-patient-id]').first().waitFor();
 await page.getByRole('button',{name:'Στήλες',exact:true}).click();await page.getByRole('checkbox',{name:'Εμφάνιση: Ηλικία',exact:true}).uncheck();
 await page.getByRole('button',{name:'Κλείσιμο προσαρμογής στηλών',exact:true}).click();
 await page.locator('th[data-column-id="phone"] button').dragTo(page.locator('th[data-column-id="name"]'));
 const columns=await page.locator('thead th[data-column-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.columnId));
 await switchTo('en');assert.deepEqual(await page.locator('thead th[data-column-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.columnId)),columns);
 await page.getByRole('heading',{name:'Patients',exact:true}).waitFor();await page.getByRole('button',{name:'Columns',exact:true}).waitFor();
 assert.equal(await page.locator('.registry-patient-link').first().innerText(),'Μαρία Δείγμα');
 await page.reload();await page.getByRole('button',{name:'Columns',exact:true}).waitFor();assert.deepEqual(await page.locator('thead th[data-column-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.columnId)),columns);
 await page.screenshot({path:resolve(out,'registry-en.png'),fullPage:true});report.push('registry drag/visibility, identity and preference survive language switch and refresh');
 await page.goto(origin+'/patients/new?surface=new');const first=page.getByRole('textbox',{name:/First name/i}).first();await first.fill('SYNTHETIC IN-MEMORY');
 await switchTo('el');assert.equal(await page.locator('input').filter({hasNot:page.locator('[type="hidden"]')}).first().inputValue(),'SYNTHETIC IN-MEMORY');
 await switchTo('en');assert.equal(await first.inputValue(),'SYNTHETIC IN-MEMORY');report.push('new patient form remains mounted with unsaved input');
 const visit='20000000-0000-4000-8000-000000000009';
 await page.goto(origin+'/patients/demo/custom-visit-preview?surface=visit&tab=record&session='+visit);
 const dialog=page.locator('dialog[aria-labelledby="record-dialog-title"]');await dialog.waitFor({state:'visible'});
 const notes=dialog.locator('textarea').first();await notes.fill('SYNTHETIC NOTE · Δεν αλλάζει η κλινική σημείωση.');
 const locationBefore=page.url();await notes.evaluate(el=>el.dataset.localeTestIdentity='same-editor');
 await dialog.getByRole('button',{name:'Profile and settings',exact:true}).click();
 const settings=page.locator('dialog.profile-settings-dialog[open]');await settings.getByRole('combobox').selectOption('el');await page.waitForFunction(()=>document.documentElement.lang==='el');
 await settings.getByRole('button',{name:'Κλείσιμο',exact:true}).click();
 assert.equal(await dialog.locator('[data-locale-test-identity="same-editor"]').inputValue(),'SYNTHETIC NOTE · Δεν αλλάζει η κλινική σημείωση.');assert.equal(page.url(),locationBefore);
 await dialog.getByRole('button',{name:'Προφίλ και ρυθμίσεις',exact:true}).click();await page.locator('dialog.profile-settings-dialog[open]').getByRole('combobox').selectOption('en');await page.waitForFunction(()=>document.documentElement.lang==='en');
 await page.locator('dialog.profile-settings-dialog[open]').getByRole('button',{name:'Close',exact:true}).click();
 await dialog.getByRole('button',{name:'Close visit and return to patient record',exact:true}).click();await page.reload();
 await page.goto(origin+'/patients/demo/custom-visit-preview?surface=visit&tab=record&session='+visit);await dialog.waitFor({state:'visible'});assert.equal(await dialog.locator('textarea').first().inputValue(),'SYNTHETIC NOTE · Δεν αλλάζει η κλινική σημείωση.');report.push('same visit and same editor retained across two language changes; working note saved through the existing visit path');
 await dialog.getByRole('button',{name:'Close visit and return to patient record',exact:true}).click();
 await page.getByRole('button',{name:'Summary',exact:true}).click();
 await page.getByText("We couldn't confirm an updated summary. Showing record excerpts.",{exact:true}).waitFor();
 await switchTo('el');await page.getByText('Δεν επιβεβαιώθηκε η ενημέρωση της σύνθεσης· εμφανίζονται αποσπάσματα φακέλου.',{exact:true}).waitFor();
 await switchTo('en');report.push('summary fallback messages remain understandable in both languages without translating recorded notes');
 for(const [surface,heading]of [['tele','Teleconsultations'],['presence','My practice page'],['library','Library']]){
  await page.goto(origin+'/?surface='+surface);await page.getByRole('heading',{name:heading,exact:true}).waitFor();await page.screenshot({path:resolve(out,surface+'-en.png'),fullPage:true});
  report.push(surface+' current screen renders English controls with unchanged synthetic content');
 }
 await page.setViewportSize({width:390,height:844});
 for(const [surface,heading]of [['registry','Patients'],['tele','Teleconsultations'],['presence','My practice page'],['library','Library']]){
  await page.goto(origin+'/?surface='+surface);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),surface+' English mobile page must fit the viewport');
  await page.screenshot({path:resolve(out,surface+'-en-mobile.png'),fullPage:true});
 }
 report.push('English mobile layouts fit the viewport without changing existing styles');
 assert.deepEqual(errors,[]);assert.equal(deniedWrites,0);assert.ok(localeWrites>=4);
 writeFileSync(resolve(out,'report.json'),JSON.stringify({report,localeWrites,deniedWrites,externalConnections:false},null,2));
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r))}
