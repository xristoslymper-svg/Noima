// Runs after clinical-recorder.mjs; reuses its actual component bundle and synthetic speech.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/recorder');
const css=readFileSync('browser-tests/clinical-recorder.mjs','utf8').match(/const fixtureCSS=`([\s\S]*?)`;/)?.[1];assert.ok(css);
const html=`<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>${css}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
let calls=0,payloadBytes=0;
const server=createServer(async(req,res)=>{
 if(req.url==='/api/transcribe'){
  for await(const chunk of req)payloadBytes+=chunk.length;calls++;
  res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Συνθετική αστοχία μεταγραφής. Ο ήχος διατηρείται.'}));return;
 }
 if(req.url==='/fixture.js'||req.url==='/fixture.css'){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'application/javascript');res.end(readFileSync(resolve(out,req.url.slice(1))));return}
 res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${resolve(out,'synthetic-speech.wav')}`]});
const report={commit:process.env.GITHUB_SHA||'local',scope:'Real browser microphone with synthetic audio; deliberately failing fixture transcription API. No live provider or patient persistence.',tests:[]};
let page;
try{
 const context=await browser.newContext({viewport:{width:1366,height:900},permissions:['microphone']});page=await context.newPage();
 await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
 await page.goto(origin);
 const title='Κλινική αποτίμηση & ενέργειες',initial='Συνθετικό περιστατικό δοκιμής. Δεν αναφέρει αϋπνία.';
 const mic=page.getByRole('button',{name:'Υπαγόρευση: '+title,exact:true});
 const ai=page.getByRole('button',{name:'Βελτίωση διατύπωσης: '+title,exact:true});
 const field=page.getByRole('textbox',{name:title,exact:true});
 await mic.click();await page.getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).waitFor();await page.waitForTimeout(1400);
 await page.getByRole('button',{name:'Ολοκλήρωση υπαγόρευσης',exact:true}).click();await page.getByRole('button',{name:'Νέα προσπάθεια μεταγραφής',exact:true}).waitFor();
 assert.equal(calls,1);assert.ok(payloadBytes>1000);assert.equal(await field.inputValue(),initial);
 assert.equal(await mic.isDisabled(),true);assert.equal(await ai.isDisabled(),true);
 assert.match(await mic.getAttribute('title'),/αποθηκευμένο ήχο/);
 assert.equal(await page.evaluate(()=>Object.values(window.qa.dirty).some(Boolean)),true);
 assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented}),true);
 await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).click();assert.equal(await page.getByTestId('navigation').textContent(),'blocked');
 await page.getByRole('button',{name:'Απόρριψη ήχου',exact:true}).click();await page.getByRole('button',{name:'Πίσω',exact:true}).waitFor();
 await page.screenshot({path:resolve(out,'cached-audio-safe-discard.png')});
 await page.getByRole('button',{name:'Πίσω',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Νέα προσπάθεια μεταγραφής',exact:true}).isVisible(),true);
 await page.getByRole('button',{name:'Συνέχεια αργότερα',exact:true}).click();assert.equal(await page.getByTestId('navigation').textContent(),'blocked');
 await page.getByRole('button',{name:'Απόρριψη ήχου',exact:true}).click();await page.getByRole('button',{name:'Απόρριψη',exact:true}).click();
 assert.equal(await field.inputValue(),initial);assert.equal(await mic.isEnabled(),true);assert.equal(await ai.isEnabled(),true);
 assert.equal(await page.evaluate(()=>Object.values(window.qa.dirty).some(Boolean)),false);
 await page.getByRole('button',{name:'Συνέχεια αργότερα',exact:true}).click();assert.equal(await page.getByTestId('navigation').textContent(),'safe');assert.equal(await page.evaluate(()=>window.qa.commits.length),0);
 assert.deepEqual(errors,[]);
 report.tests.push({name:'failed-transcription audio blocks navigation and conflicting actions until explicit discard',status:'passed',calls,payloadBytes});
}catch(error){report.tests.push({name:'cached-audio guard',status:'failed',error:String(error.stack||error)});if(page)await page.screenshot({path:resolve(out,'cached-audio-guard-failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1}
finally{await browser.close();await new Promise(r=>server.close(r));writeFileSync(resolve(out,'audio-guard-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
