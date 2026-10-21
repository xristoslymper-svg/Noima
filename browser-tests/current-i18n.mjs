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
  if(url.pathname==='/api/auth/options')return res.end(JSON.stringify({google:true,email_signup:true,email_recovery:true}));
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
 const checkRecorderChrome=async(mobile)=>{
  const controls=await dialog.locator('[data-record-controls]>button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height}}));
  assert.equal(controls.length,2);assert.ok(controls.every(r=>r.height>=44));assert.ok(controls[1].x>=controls[0].right+5);assert.ok(Math.abs(controls[0].y-controls[1].y)<2);
  const buttons=await dialog.locator('[data-visit-actions]>button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {height:r.height,radius:parseFloat(s.borderRadius),border:s.borderStyle}}));
  assert.ok(buttons.length>0);assert.ok(buttons.every(b=>b.height>=44&&b.radius>=10&&b.border==='solid'));
  assert.ok(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1));
  await page.screenshot({path:resolve(out,mobile?'recorder-chrome-mobile.png':'recorder-chrome-desktop.png'),fullPage:true});
 };
 await checkRecorderChrome(false);

 const notes=dialog.locator('textarea').first();await notes.fill('SYNTHETIC NOTE · Δεν αλλάζει η κλινική σημείωση.');
 const locationBefore=page.url();await notes.evaluate(el=>el.dataset.localeTestIdentity='same-editor');
 await dialog.getByRole('button',{name:'Profile and settings',exact:true}).click();
 const settings=page.locator('dialog.profile-settings-dialog[open]');assert.equal(await settings.getByRole('combobox').count(),0);assert.equal(await settings.getByRole('group',{name:'Language',exact:true}).count(),0);
 await settings.getByRole('button',{name:'Close',exact:true}).click();
 assert.equal(await dialog.locator('[data-locale-test-identity="same-editor"]').inputValue(),'SYNTHETIC NOTE · Δεν αλλάζει η κλινική σημείωση.');assert.equal(page.url(),locationBefore);
 await dialog.getByRole('button',{name:'Close visit and return to patient record',exact:true}).click();await page.reload();
 await page.goto(origin+'/patients/demo/custom-visit-preview?surface=visit&tab=record&session='+visit);await dialog.waitFor({state:'visible'});assert.equal(await dialog.locator('textarea').first().inputValue(),'SYNTHETIC NOTE · Δεν αλλάζει η κλινική σημείωση.');report.push('removing in-app language settings preserves the same editor, visit and working note through refresh');
 await dialog.getByRole('button',{name:'Close visit and return to patient record',exact:true}).click();
 await page.getByRole('button',{name:'Summary',exact:true}).click();
 await page.getByText("The verified synthesis could not be completed. These are record excerpts, not an AI summary. You can try again.",{exact:true}).waitFor();
 await switchTo('el');await page.getByText('Δεν ολοκληρώθηκε η επιβεβαιωμένη σύνθεση. Εμφανίζονται αποσπάσματα, όχι AI σύνοψη. Μπορείτε να δοκιμάσετε ξανά.',{exact:true}).waitFor();
 await switchTo('en');report.push('summary fallback messages remain understandable in both languages without translating recorded notes');
 for(const [surface,heading]of [['tele','Teleconsultations'],['presence','My practice page'],['library','Library']]){
  await page.goto(origin+'/?surface='+surface);await page.getByRole('heading',{name:heading,exact:true}).waitFor();await page.screenshot({path:resolve(out,surface+'-en.png'),fullPage:true});
  report.push(surface+' current screen renders English controls with unchanged synthetic content');
 }
 await page.setViewportSize({width:390,height:844});
 for(const [surface,heading,greekHeading]of [['registry','Patients','Ασθενείς'],['tele','Teleconsultations','Τηλεσυνεδρίες'],['presence','My practice page','Η σελίδα του ιατρείου μου'],['library','Library','Βιβλιοθήκη']]){
  await page.goto(origin+'/?surface='+surface);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
  const styleSignature=()=>page.locator('h1').evaluate(el=>{const s=getComputedStyle(el);return {font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,color:s.color}});
  const englishStyle=await styleSignature();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),surface+' English mobile page must fit the viewport');
  await page.screenshot({path:resolve(out,surface+'-en-mobile.png'),fullPage:true});
  await switchTo('el');await page.getByRole('heading',{name:greekHeading,exact:true}).waitFor();
  assert.deepEqual(await styleSignature(),englishStyle,surface+' Greek/English heading typography and colors must match');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),surface+' Greek mobile page must fit the viewport');
  await page.screenshot({path:resolve(out,surface+'-el-mobile.png'),fullPage:true});
  await switchTo('en');
 }
 report.push('paired Greek/English mobile layouts fit the viewport with identical heading colors and typography');

 await page.goto(origin+'/patients/demo/custom-visit-preview?surface=visit&tab=record&session='+visit);await dialog.waitFor({state:'visible'});
 await checkRecorderChrome(true);assert.equal(await dialog.locator('textarea').first().inputValue(),'SYNTHETIC NOTE · Δεν αλλάζει η κλινική σημείωση.');
 await dialog.getByRole('button',{name:'Close visit and return to patient record',exact:true}).click();
 report.push('recorder header controls align without overlap and customization buttons retain consistent styling on desktop/mobile; saved notes unchanged');
 // Real auth components: the selector exists only on login and preference survives navigation/refresh.
 await page.goto(origin+'/login?surface=login');
 await page.getByRole('button',{name:'English',exact:true}).waitFor();
 await page.getByRole('button',{name:'Ελληνικά',exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.lang==='el');
 await page.reload();await page.getByRole('button',{name:'Ελληνικά',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Ελληνικά',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.lang==='en');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 assert.equal(await page.locator('.login-language-buttons').count(),0);
 await page.getByRole('button',{name:/already.*account|existing.*account/i}).click();
 await page.getByRole('button',{name:'English',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'English',exact:true}).getAttribute('aria-pressed'),'true');
 await page.screenshot({path:resolve(out,'auth-login-en-mobile.png'),fullPage:true});
 for(const surface of ['recovery','reset','activate']){
  await page.goto(origin+'/?surface='+surface);await page.locator('.auth-card h1').waitFor();
  assert.equal(await page.locator('.login-language-buttons').count(),0);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),surface+' fits mobile');
  await page.screenshot({path:resolve(out,'auth-'+surface+'-en-mobile.png'),fullPage:true});
 }
 await page.goto(origin+'/?surface=account');await page.locator('.pilot-account h1').waitFor();
 assert.equal(await page.locator('.language-setting').count(),0);
 await page.goto(origin+'/patients');await page.locator('[data-patient-id]').first().waitFor();
 await page.getByRole('button',{name:'Profile and settings',exact:true}).click();
 assert.equal(await page.locator('dialog.profile-settings-dialog[open]').getByRole('combobox').count(),0);
 assert.equal(await page.locator('dialog.profile-settings-dialog[open] .language-setting').count(),0);
 report.push('language selection is login-only; login choice survives refresh, registration, recovery and authenticated settings without changing clinical data');

 await page.setViewportSize({width:1440,height:1000});
 await page.goto(origin+'/patients/demo/custom-visit-preview?surface=visit&tab=record&session=20000000-0000-4000-8000-000000000002');
 await page.locator('[data-completed-record][data-reading="true"]').waitFor();
 const recorded=await page.locator('.completed-record-form textarea').evaluateAll(nodes=>nodes.map(n=>n.value));
 assert.ok(recorded.some(Boolean));
 assert.equal(await page.locator('.completed-record-form').getAttribute('disabled'),'');
 assert.ok(await page.locator('.completed-record-form textarea').first().isDisabled());
 const memory=await page.locator('[data-confirmed-memory]').innerText();
 assert.ok(memory.includes('100 mg'));
 assert.equal(await page.locator('[data-confirmed-memory]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),3);
 await page.screenshot({path:resolve(out,'completed-polish-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('[data-confirmed-memory]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
 assert.ok(await page.locator('dialog[open]').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await page.screenshot({path:resolve(out,'completed-polish-mobile.png'),fullPage:true});
 await page.reload();await page.locator('[data-completed-record]').waitFor();
 assert.deepEqual(await page.locator('.completed-record-form textarea').evaluateAll(nodes=>nodes.map(n=>n.value)),recorded);
 assert.equal(await page.locator('[data-confirmed-memory]').innerText(),memory);
 await page.getByRole('button',{name:'Correct record',exact:true}).click();
 assert.equal(await page.locator('[data-completed-record]').getAttribute('data-reading'),'false');
 assert.equal(await page.locator('.completed-record-form').getAttribute('disabled'),null);
 assert.equal(await page.locator('.completed-record-form textarea').first().isDisabled(),false);
 assert.deepEqual(await page.locator('.completed-record-form textarea').evaluateAll(nodes=>nodes.map(n=>n.value)),recorded);
 report.push('completed reading boxes adapt to mobile; canonical clinical text survives refresh unchanged and existing correction editor stays editable');

 // Audited visual surfaces: real components, Greek/English, no uploads or clinical writes.
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(origin+'/?surface=scan');await page.locator('.scan-card h1').waitFor();
 const scanFont=await page.locator('.scan-card h1').evaluate(el=>getComputedStyle(el).fontFamily);
 assert.match(scanFont,/Inter/);
 assert.equal(await page.locator('input[type="file"]').count(),1);
 assert.equal(await page.locator('.scan-submit').isDisabled(),true);
 await page.screenshot({path:resolve(out,'scan-polish-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await switchTo('el');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'scan Greek fits mobile');
 await page.screenshot({path:resolve(out,'scan-polish-mobile.png'),fullPage:true});
 await switchTo('en');
 report.push('paper import uses matching typography and fits both languages/mobile; original upload and recognition controls preserved');

 assert.deepEqual(errors,[]);assert.equal(deniedWrites,0);assert.ok(localeWrites>=4);
 writeFileSync(resolve(out,'report.json'),JSON.stringify({report,localeWrites,deniedWrites,externalConnections:false},null,2));
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r))}
