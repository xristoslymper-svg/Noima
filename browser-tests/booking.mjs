import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/booking');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/booking-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},tsconfigRaw:{compilerOptions:{baseUrl:process.cwd(),paths:{'@/*':['./*']}}}});
const html='<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>';
const server=createServer((req,res)=>{if(['/fixture.js','/fixture.css'].includes(req.url)){res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(resolve(out,req.url.slice(1))));return}res.setHeader('content-type','text/html');res.end(html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;

const browser=await chromium.launch();
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const context=await browser.newContext({viewport}),page=await context.newPage();const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
 const slot={start:'2026-10-30T12:00:00Z',end:'2026-10-30T12:50:00Z'},id='60000000-0000-4000-8000-000000000001',patient='60000000-0000-4000-8000-000000000002',event='60000000-0000-4000-8000-000000000003';let sends=0,approvals=0,approved=false;const sentIds=[];
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin){external.push(req.url());return route.abort()}
 if(url.pathname==='/api/presence/public'){if(req.method()==='GET')return route.fulfill({json:{enabled:true,slots:[slot],timezone:'Europe/Athens'}});
 const body=req.postDataJSON();sentIds.push(body.request.id);assert.equal(body.request.start,slot.start);assert.equal(body.request.end,slot.end);assert.equal(body.request.consent,true);sends++;return route.fulfill({status:sends===1?503:200,json:sends===1?{error:'Προσωρινό σφάλμα σύνδεσης'}:{received:true}})}
 if(url.pathname==='/api/presence/booking'){if(req.method()==='GET')return route.fulfill({json:{settings:null,patients:[{id:patient,name:'Συνθετικός Ασθενής'}],requests:[{id,payload:{name:'Συνθετικός Ασθενής',email:'synthetic@example.com',phone:'6900000000',kind:'Δια ζώσης'},...slot,status:approved?'approved':'pending',event_id:approved?event:null,event_status:approved?'scheduled':null,event_start:approved?slot.start:null,patient_id:approved?patient:null,created_at:slot.start}]}});
 const b=req.postDataJSON();assert.equal(b.confirmed,true);assert.equal(b.patient_id,patient);approvals++;if(approvals===1)return route.fulfill({status:409,json:{error:'Η ώρα δεν είναι πλέον διαθέσιμη. Δεν δημιουργήθηκε ραντεβού.'}});approved=true;return route.fulfill({json:{approved:true,event_id:event}})}
 return route.continue()});
 await page.goto(origin);await page.getByRole('button',{name:'Αίτημα ραντεβού',exact:true}).click();
 for(const [name,value] of [['Ονοματεπώνυμο','Συνθετικός Ασθενής'],['Email','synthetic@example.com'],['Τηλέφωνο','6900000000']])await page.getByRole('textbox',{name,exact:true}).fill(value);
 await page.getByRole('combobox',{name:'Ημέρα',exact:true}).selectOption('2026-10-30');await page.getByRole('combobox',{name:'Διαθέσιμη ώρα',exact:true}).selectOption(slot.start);await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Υποβολή αιτήματος',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('textbox',{name:'Ονοματεπώνυμο',exact:true}).inputValue(),'Συνθετικός Ασθενής');
 await page.getByRole('button',{name:'Υποβολή αιτήματος',exact:true}).click();await page.getByRole('status').filter({hasText:'δεν έχει κλειστεί'}).waitFor();assert.equal(sends,2);assert.equal(sentIds[0],sentIds[1]);await page.screenshot({path:resolve(out,viewport.width+'-request.png'),fullPage:true});
 await page.goto(origin+'/?owner');await page.getByRole('button',{name:'Έγκριση & καταχώριση',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Έγκριση & καταχώριση',exact:true}).isDisabled(),true);
 await page.getByRole('combobox',{name:'Σύνδεση με ασθενή',exact:true}).selectOption(patient);await page.getByRole('button',{name:'Έγκριση & καταχώριση',exact:true}).click();await page.getByRole('button',{name:'Επιβεβαίωση ραντεβού',exact:true}).click();await page.getByRole('alert').filter({hasText:'δεν είναι πλέον διαθέσιμη'}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'Σύνδεση με ασθενή',exact:true}).inputValue(),patient);
 await page.getByRole('button',{name:'Επιβεβαίωση ραντεβού',exact:true}).click();await page.getByRole('link',{name:'Προβολή στο ημερολόγιο',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Προβολή στο ημερολόγιο',exact:true}).getAttribute('href'),'/calendar?event='+event);
 assert.equal(await page.getByRole('button',{name:'Έγκριση & καταχώριση',exact:true}).count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await page.screenshot({path:resolve(out,viewport.width+'-approved.png'),fullPage:true});await context.close();
}}finally{await browser.close();server.close()}
