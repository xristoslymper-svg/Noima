// Runs only in GitHub Actions: actual components, fully synthetic HTTP, no shared database.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/patient-entry');mkdirSync(out,{recursive:true});
const seed=JSON.parse(readFileSync('browser-tests/fixtures/warm-patient.json','utf8'));
const first={...seed.patient,first_name:'Μαρία',last_name:'Δείγμα',phone:'6900000001',email:'first@example.invalid',reported_age:32,registry_number:1};
const second={...first,id:'20000000-0000-4000-8000-000000000099',phone:'6900000002',email:'second@example.invalid',reported_age:54,registry_number:2};
const bundle={...seed,patient:first,appointments:[]};
const draft=bundle.sessions.find(s=>s.status==='draft');assert.ok(draft);draft.started_at='2020-01-01T10:00:00Z';
let writes=[],failCreate=true,lookupFailure=false;
await build({entryPoints:['browser-tests/patient-entry-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_NOIMA_MOBILE_V2':'"0"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'},plugins:[{name:'navigation',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'navigation'}));
 b.onLoad({filter:/.*/,namespace:'navigation'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/link'?"import React from 'react';export default function Link({children,...p}){return <a {...p}>{children}</a>}":"export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:u=>location.assign(u),replace:u=>location.replace(u),refresh:()=>location.reload()});"}));
}}]});
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');res.setHeader('cache-control','no-store');
 if(url.pathname.startsWith('/api/')){
  res.setHeader('content-type','application/json');
  if(req.method!=='GET'){let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw||'{}');writes.push(body);
   if(body.action==='create_patient'){if(failCreate){res.statusCode=503;return res.end(JSON.stringify({error:'Synthetic save failure'}))}return res.end(JSON.stringify({patient:first}))}
   if(body.action==='start_session'){
    assert.equal(body.patient_id,first.id);const appointment=bundle.appointments.find(a=>a.id===body.appointment_id);assert.ok(appointment);
    const created={id:body.request_id,patient_id:first.id,tester_id:first.tester_id,session_type:'follow_up',status:'draft',version:0,closure_version:0,closure_draft:null,continuity:null,started_at:new Date().toISOString(),completed_at:null,updated_at:new Date().toISOString()};
    bundle.sessions.push(created);appointment.session_id=created.id;return res.end(JSON.stringify({session:created}));
   }
   if(body.action==='list')return res.end(JSON.stringify({intakes:[]}));
   res.statusCode=409;return res.end(JSON.stringify({error:'Unexpected synthetic write'}));
  }
  if(url.pathname.includes('summary')){res.statusCode=503;return res.end(JSON.stringify({error:'Synthetic AI disabled'}))}
  if(!url.searchParams.has('patient')&&!url.searchParams.has('session')&&url.pathname==='/api/patients/demo/runtime'){
   if(lookupFailure){res.statusCode=503;return res.end(JSON.stringify({error:'offline'}))}
   return res.end(JSON.stringify({patients:[first,second]}));
  }
  return res.end(JSON.stringify({bundle}));
 }
 if(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'){res.setHeader('content-type',url.pathname.endsWith('css')?'text/css':'text/javascript');return res.end(readFileSync(resolve(out,url.pathname.slice(1))))}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();const report=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'noima-workspace-id',value:seed.patient.tester_id,url:origin}]);
 await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto(origin+'/patients/new');
 await p.getByLabel('Όνομα *',{exact:true}).fill('Μαρία');await p.getByLabel('Επώνυμο',{exact:true}).fill('Δείγμα');
 await p.getByLabel('Κινητό',{exact:true}).fill('6900000002');
 await p.getByRole('heading',{name:'Υπάρχει ήδη φάκελος;'}).waitFor();
 await p.reload();assert.equal(await p.getByLabel('Όνομα *',{exact:true}) .evaluate(e=>e.value),'Μαρία');
 assert.equal(await p.getByLabel('Κινητό',{exact:true}).inputValue(),'6900000002');
 await p.getByText('Ανακτήθηκε η μη υποβλημένη εγγραφή.',{exact:false}).waitFor();
 await p.getByRole('button',{name:'Δημιουργία φακέλου',exact:true}).click();assert.equal(writes.length,0,'duplicate review precedes create');
 await p.getByRole('button',{name:'Είναι διαφορετικός ασθενής — δημιουργία'}).click();
 await p.getByRole('alert').filter({hasText:'Synthetic save failure'}).waitFor();assert.equal(writes.length,1);
 await p.reload();assert.equal(await p.getByLabel('Κινητό',{exact:true}).inputValue(),'6900000002');
 await p.screenshot({path:resolve(out,'recovered-registration.png'),fullPage:true});
 report.push('refresh and failed submission retain registration; duplicates require explicit choice');
 // Explicitly discard; no server deletion.
 await p.getByRole('button',{name:'Καθαρισμός προσχεδίου'}).click();await p.reload();assert.equal(await p.getByLabel('Όνομα *',{exact:true}).inputValue(),'');
 await p.goto(origin+'/patients');await p.getByRole('searchbox',{name:'Αναζήτηση ασθενών'}).fill('6900000002');
 await p.locator('.registry-patient-link').first().waitFor();assert.equal(await p.locator('.registry-patient-link').count(),1);assert.match(await p.locator('[data-patient-id="'+second.id+'"] [data-column-id="phone"]').innerText(),/6900000002/);assert.match(await p.locator('[data-patient-id="'+second.id+'"] [data-column-id="age"]').innerText(),/54 ετών/);
 await p.getByRole('searchbox',{name:'Αναζήτηση ασθενών'}).fill('μαρια δειγμα');assert.equal(await p.locator('.registry-patient-link').count(),2);
 await p.screenshot({path:resolve(out,'same-names.png'),fullPage:true});report.push('same names distinguished by age/contact/registry and searchable by phone');
 await p.goto(origin+'/patients/demo/'+first.id+'?tab=summary');
 await p.getByRole('button',{name:'Ενέργειες',exact:true}).click();
 await p.getByRole('menu',{name:'Ενέργειες ασθενή'}).waitFor();
 await p.getByRole('menuitem',{name:'Νέα επίσκεψη',exact:true}).waitFor();
 assert.equal(writes.filter(w=>w.action==='start_session').length,0);
 await p.screenshot({path:resolve(out,'old-draft-choice.png'),fullPage:true});
 await p.getByRole('menuitem',{name:/Ολοκλήρωση σημειώσεων/}).click();
 await p.locator('dialog[open] .visit-workspace').waitFor();assert.match(p.url(),new RegExp(draft.id));
 await p.keyboard.press('Escape');await p.locator('dialog[open]').waitFor({state:'detached'});
 assert.equal(await p.getByRole('button',{name:'Ενέργειες',exact:true}).isVisible(),true);
 assert.equal(writes.filter(w=>w.action==='start_session').length,0);
 report.push('old draft is explicitly selected and keeps identity; no new session or relinking');
 // Existing appointment entry must not silently adopt yesterday's draft.
 bundle.appointments=[{id:'30000000-0000-4000-8000-000000000099',session_id:null,status:'scheduled',appointment_type:'follow_up',scheduled_start:new Date().toISOString(),scheduled_end:new Date(Date.now()+3000000).toISOString()}];
 await p.goto(origin+'/patients/demo/'+first.id+'?appointment='+bundle.appointments[0].id);
 await p.getByRole('button',{name:'Ενέργειες',exact:true}).click();
 await p.getByRole('menu',{name:'Ενέργειες ασθενή'}).waitFor();
 await p.getByRole('menuitem',{name:'Νέα επίσκεψη',exact:true}).click();
 await p.locator('dialog[open] .visit-workspace').waitFor();
 const newId=new URL(p.url()).searchParams.get('session');assert.notEqual(newId,draft.id);
 assert.equal(bundle.appointments[0].session_id,newId);assert.equal(draft.started_at,'2020-01-01T10:00:00Z');assert.equal(draft.status,'draft');
 assert.equal(writes.filter(w=>w.action==='start_session').length,1);
 await p.keyboard.press('Escape');await p.locator('dialog[open]').waitFor({state:'detached'});
 report.push('new appointment creates its own visit and never relinks or closes the older record');
 await p.getByRole('button',{name:'Ενέργειες',exact:true}).click();
 const beforeAppointment=p.url(),beforeWrites=writes.length;
 await p.getByRole('menuitem',{name:'Νέο ραντεβού',exact:true}).click();
 const appointmentDialog=p.getByRole('dialog',{name:'Νέο ραντεβού',exact:true});await appointmentDialog.waitFor();
 assert.match(await appointmentDialog.textContent(),/Μαρία Δείγμα/);assert.equal(p.url(),beforeAppointment);
 assert.equal(await appointmentDialog.getByLabel('Ημερομηνία',{exact:true}).isVisible(),true);
 await p.keyboard.press('Escape');await appointmentDialog.waitFor({state:'detached'});assert.equal(writes.length,beforeWrites);
 await p.getByRole('button',{name:'Ενέργειες',exact:true}).click();
 await p.getByRole('menuitem',{name:'Αποστολή ερωτηματολογίου',exact:true}).click();
 await p.getByText('Θα καταχωριστεί στον υπάρχοντα φάκελο.',{exact:true}).waitFor();
 assert.equal(writes.filter(w=>w.action==='assign').length,0);
 await p.keyboard.press('Escape');
 await p.getByRole('button',{name:'Ενέργειες',exact:true}).click();await p.keyboard.press('Escape');
 assert.equal(await p.getByRole('menu',{name:'Ενέργειες ασθενή'}).count(),0);
 await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'Ενέργειες',exact:true}).click();
 const menu=p.getByRole('menu',{name:'Ενέργειες ασθενή'});
 const rect=await menu.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390);
 await p.screenshot({path:resolve(out,'mobile-patient-actions.png'),fullPage:true});
 await p.keyboard.press('Escape');await p.setViewportSize({width:1440,height:1000});
 report.push('appointment popup keeps patient and URL without writes; questionnaire is patient-scoped without assignment; Escape closes menu; mobile menu fits');
 // Successful creation clears recovery; only the fixture receives this request.
 await p.goto(origin+'/patients/new');await p.getByLabel('Όνομα *',{exact:true}).fill('Άλλος Συνθετικός');
 failCreate=false;await p.getByRole('button',{name:'Δημιουργία φακέλου',exact:true}).click();
 await p.waitForURL('**/patients/demo/'+first.id+'?new=1');
 await p.goto(origin+'/patients/new');assert.equal(await p.getByLabel('Όνομα *',{exact:true}) .evaluate(e=>e.value),'');
 report.push('successful fixture creation clears recovery');
 // Mobile retains the same form and avoids horizontal overflow.
 await p.setViewportSize({width:390,height:844});
 await p.getByLabel('Όνομα *',{exact:true}).fill('Συνθετικός');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.screenshot({path:resolve(out,'mobile-registration.png'),fullPage:true});
 assert.deepEqual(errors,[]);await context.close();
 writeFileSync(resolve(out,'report.json'),JSON.stringify({tests:report,liveWrites:0,syntheticCreateRequests:writes.filter(w=>w.action==='create_patient').length},null,2));
 console.log(report.join('\n'));
}finally{await browser.close();await new Promise(r=>server.close(r))}
