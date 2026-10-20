import assert from 'node:assert/strict';
import {build} from 'esbuild';import {chromium} from 'playwright';import {createServer} from 'node:http';import {readFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';
const out=resolve('test-results/visit-layout');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/visit-layout-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'}});
let bundle=JSON.parse(readFileSync('lib/clinical/treatment-preview.json','utf8'));let writes=0,appointmentAttempts=[],failAppointment=true;
const server=createServer(async(req,res)=>{res.setHeader('cache-control','no-store');const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/bundle'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(bundle))}
 if(url.pathname==='/api/calendar/command/apply'){
  let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);appointmentAttempts.push(body);res.setHeader('content-type','application/json');
  if(failAppointment){failAppointment=false;res.statusCode=409;return res.end(JSON.stringify({error:'Η ώρα δεν είναι διαθέσιμη.'}))}
  const event={id:body.request_id,patient_id:body.patient_id,scheduled_start:body.start_iso,scheduled_end:body.end_iso,status:'scheduled',appointment_type:body.appointment_type,session_id:null};
  if(!bundle.appointments.some(a=>a.id===event.id))bundle.appointments.push(event);return res.end(JSON.stringify({event}));
 }
 if(url.pathname==='/api/patients/demo/custom-section'){
  let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);assert.equal(body.action,'save_custom_section');writes++;
  let section=bundle.sections.find(s=>s.session_id===body.session_id&&s.section_key===body.section_key);
  if(section&&section.version!==body.expected_version){res.statusCode=409;return res.end(JSON.stringify({error:'stale_section'}))}
  if(!section){section={id:body.section_key,session_id:body.session_id,patient_id:bundle.patient.id,section_key:body.section_key,version:0,source:'manual'};bundle.sections.push(section)}
  section.content=body.title+'\n\n'+body.content;section.version++;res.setHeader('content-type','application/json');return res.end(JSON.stringify({section}));
 }
 if(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'){res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':'application/javascript');return res.end(readFileSync(resolve(out,url.pathname.slice(1))))}
 res.setHeader('content-type','text/html');res.end('<html lang="el"><head><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
try{const page=await browser.newPage({viewport:{width:1280,height:1000}});await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('button',{name:'Προσαρμογή καταγραφής',exact:true}).click();
 await page.getByLabel('Τίτλος νέας ενότητας').fill('Ύπνος & καθημερινότητα');await page.getByRole('button',{name:'Προσθήκη ενότητας',exact:true}).click();
 await page.getByLabel('Ύπνος & καθημερινότητα',{exact:true}).fill('Συνθετική καταγραφή ύπνου.');
 await page.getByRole('button',{name:'Έλεγχος αποθήκευσης',exact:true}).click();
 await page.waitForFunction(()=>document.body.textContent.includes('Οι σημειώσεις αποθηκεύτηκαν'));
 assert.equal(writes,1);assert.match(bundle.sections.at(-1).content,/Ύπνος & καθημερινότητα\n\nΣυνθετική καταγραφή ύπνου/);
 await page.getByRole('button',{name:'Μετακίνηση πάνω: Ύπνος & καθημερινότητα',exact:true}).click();
 await page.getByRole('button',{name:'Σύμπτυξη: Ύπνος & καθημερινότητα',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'Προσαρμογή καταγραφής',exact:true}).click();
 await page.getByRole('button',{name:'Ανάπτυξη: Ύπνος & καθημερινότητα',exact:true}).click();
 // The real fixture reloads canonical sections; template never stores note bodies.
 await page.getByRole('button',{name:'Έλεγχος αποθήκευσης',exact:true}).click();
 const preference=await page.evaluate(()=>Object.values(localStorage).join(''));assert.ok(!preference.includes('Συνθετική καταγραφή ύπνου'));
 await page.screenshot({path:resolve(out,'customization.png'),fullPage:true});
 const location=page.url(),oldSessions=JSON.stringify(bundle.sessions);
 await page.getByRole('button',{name:'Ενέργειες',exact:true}).click();
 await page.getByRole('menuitem',{name:'Νέο ραντεβού',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Νέο ραντεβού',exact:true});
 await dialog.waitFor();assert.equal(page.url(),location);
 assert.match(await dialog.textContent(),/Ira Pira/);
 await dialog.getByLabel('Ημερομηνία',{exact:true}).fill('2027-01-15');
 await dialog.getByLabel('Ώρα Αθήνας',{exact:true}).fill('17:00');
 await dialog.getByRole('button',{name:'Προγραμματισμός',exact:true}).click();
 await dialog.getByRole('alert').filter({hasText:'Η ώρα δεν είναι διαθέσιμη.'}).waitFor();
 assert.equal(await dialog.getByLabel('Ημερομηνία',{exact:true}).inputValue(),'2027-01-15');
 assert.equal(await dialog.getByLabel('Ώρα Αθήνας',{exact:true}).inputValue(),'17:00');
 await dialog.getByRole('button',{name:'Προγραμματισμός',exact:true}).click();
 await dialog.waitFor({state:'detached'});
 assert.equal(appointmentAttempts.length,2);
 assert.equal(appointmentAttempts[0].request_id,appointmentAttempts[1].request_id);
 assert.equal(appointmentAttempts[1].patient_id,bundle.patient.id);
 assert.equal(appointmentAttempts[1].action,'create');
 assert.equal(bundle.appointments.filter(a=>a.id===appointmentAttempts[1].request_id).length,1);
 assert.equal(JSON.stringify(bundle.sessions),oldSessions);assert.equal(page.url(),location);
 await page.getByRole('button',{name:'Ενέργειες',exact:true}).click();
 await page.getByRole('menuitem',{name:'Νέο ραντεβού',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Νέο ραντεβού',exact:true});await dialog.waitFor();
 assert.match(await dialog.textContent(),/2027/);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(appointmentAttempts.length,2);
 await page.screenshot({path:resolve(out,'patient-appointment.png'),fullPage:true});
 console.log('Patient appointment scenarios passed: same-page popup, scoped patient, failed save retains values, retry idempotency, refresh, cancel without writes, visits unchanged');
 console.log('Visit customization browser scenarios passed: add, save, keyboard reorder, collapse, refresh, no clinical data in preferences');
}finally{await browser.close();server.close()}
