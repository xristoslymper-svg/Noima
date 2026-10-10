// Runs AFTER clinical-recorder.mjs has built the production component fixture
// and synthetic speech WAV. Unlike the original fixture API, uploads go through
// the REAL /api/transcribe handler AND withPilot multipart wrapper.
// External authentication/provider responses and patient persistence are fixtures.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {transcriptionRoute} from '../tests/helpers/transcription-route.mjs';

const out=resolve('test-results/recorder'),uploads=[],forwarded=[],errors=[];
const texts=['Συνθετική δοκιμή: αναφέρει κόπωση. Δεν αναφέρει αϋπνία.','Διατηρεί επαφή με φίλους.','Πρόσθετη συνθετική παράγραφος.'];
let completed=0,failNext=false;
const route=transcriptionRoute({provider:async({init,scope})=>{
 assert.equal(scope.workspace,'synthetic-workspace');
 const file=init.body.get('file');assert.ok(file instanceof File);assert.ok(file.size>800);
 const bytes=Buffer.from(await file.arrayBuffer());forwarded.push({sha:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
 if(failNext){failNext=false;return Response.json({error:'synthetic-provider-outage'},{status:503})}
 return Response.json({text:texts[Math.min(completed++,texts.length-1)]});
}});
const css='body{margin:0;padding:24px 32px 160px;background:#f8f6f1;color:#293e36;font:16px Arial}.visit-part{padding:22px;margin:20px 0;background:white;border:1px solid #dce5df;border-radius:16px}.finalize-bar{position:fixed;bottom:0;left:16px;right:16px;display:flex;justify-content:flex-end;align-items:center;gap:10px;background:#f7faf8;padding:12px;z-index:50}.finalize-bar button{padding:12px}.test-only{display:none}textarea{min-height:110px;border:1px solid #dce5df;border-radius:12px;padding:12px;font:16px/1.5 Arial}';
const html=`<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>${css}</style><div id="root"></div><script src="/fixture.js"></script></html>`;
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/api/transcribe'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
   const request=new Request(`http://${req.headers.host}/api/transcribe`,{method:'POST',headers,body:Buffer.concat(chunks)});
   const form=await request.clone().formData(),file=form.get('file')??form.get('audio');assert.ok(file instanceof File);
   const bytes=Buffer.from(await file.arrayBuffer()),filePath=resolve(out,`contract-capture-${uploads.length}.webm`);writeFileSync(filePath,bytes);
   const decoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',filePath,'-f','f32le','-ac','1','-ar','16000','pipe:1'],{maxBuffer:16*1024*1024});
   assert.equal(decoded.status,0,decoded.stderr.toString());let energy=0;for(let n=0;n+4<=decoded.stdout.length;n+=4)energy+=decoded.stdout.readFloatLE(n)**2;
   const upload={field:form.has('file')?'file':'audio',bytes:bytes.length,sha:createHash('sha256').update(bytes).digest('hex'),duration:decoded.stdout.length/4/16000,rms:Math.sqrt(energy/(decoded.stdout.length/4))};uploads.push(upload);
   const response=await route.POST(request);upload.status=response.status;
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  if(req.url==='/fixture.js'||req.url==='/fixture.css'){res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'application/javascript');res.end(readFileSync(resolve(out,req.url.slice(1))));return}
  if(req.url?.startsWith('/api/')){res.writeHead(500);res.end('Unexpected API call');return}
  res.setHeader('content-type','text/html');res.end(html);
 }catch(e){errors.push(String(e));res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:String(e)}))}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${resolve(out,'synthetic-speech.wav')}`]});
const report={commit:process.env.GITHUB_SHA||'local',scope:'Native Chromium synthetic audio -> real HTTP multipart -> real withPilot and /api/transcribe -> provider fixture. Not live speech recognition, real login, or Supabase patient persistence.',status:'running',checks:[],uploads,forwarded};
let page;
async function until(fn){let last;for(let n=0;n<80;n++){try{await fn();return}catch(e){last=e}await new Promise(r=>setTimeout(r,100))}throw last}
try{
 const context=await browser.newContext({viewport:{width:1366,height:900},permissions:['microphone']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.goto(origin);
 const title='Κλινική αποτίμηση & ενέργειες',field=page.getByRole('textbox',{name:title,exact:true});
 const mic=page.getByRole('button',{name:'Υπαγόρευση: '+title,exact:true}),dock=page.getByRole('region',{name:'Υπαγόρευση: '+title,exact:true});
 const confirm=page.getByRole('button',{name:'Επιβεβαίωση',exact:true});
 await field.waitFor();const initial=await field.inputValue();
 await mic.click();await dock.getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).waitFor();await page.waitForTimeout(1500);
 await dock.getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).click();const time=await dock.locator('time').textContent();await page.waitForTimeout(650);assert.equal(await dock.locator('time').textContent(),time);
 await dock.getByRole('button',{name:'Συνέχιση υπαγόρευσης',exact:true}).click();await page.waitForTimeout(1100);
 await dock.getByRole('button',{name:'Ολοκλήρωση υπαγόρευσης',exact:true}).click();await dock.waitFor({state:'detached'});await confirm.waitFor();
 assert.equal(uploads.length,1);assert.equal(uploads[0].status,200);assert.equal(forwarded[0].sha,uploads[0].sha);assert.ok(uploads[0].rms>0.0001);
 assert.equal(await field.inputValue(),initial+'\n\n'+texts[0]);assert.equal(await page.evaluate(()=>window.qa.commits.length),0);
 report.checks.push('native pause/resume audio reaches real handler and provider intact; review is pending');
 const edited=(await field.inputValue())+' Χειροκίνητη διόρθωση.';await field.fill(edited);
 await mic.click();await dock.getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).waitFor();await page.waitForTimeout(1300);
 await dock.getByRole('button',{name:'Ολοκλήρωση υπαγόρευσης',exact:true}).click();await dock.waitFor({state:'detached'});await until(async()=>assert.equal(await confirm.isEnabled(),true));
 assert.equal(await field.inputValue(),edited+'\n\n'+texts[1]);assert.equal(uploads[1].status,200);assert.equal(forwarded[1].sha,uploads[1].sha);
 await confirm.click();await until(async()=>assert.equal(await page.evaluate(()=>window.qa.commits.length),1));
 report.checks.push('second multipart upload appends without overwriting manual edits; explicit confirmation');
 failNext=true;await mic.click();await dock.getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).waitFor();await page.waitForTimeout(1300);
 await dock.getByRole('button',{name:'Ολοκλήρωση υπαγόρευσης',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(uploads[2].status,502);
 await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).click();assert.equal(await page.getByTestId('navigation').textContent(),'blocked');
 await page.getByRole('button',{name:'Νέα προσπάθεια μεταγραφής',exact:true}).click();await confirm.waitFor();await until(async()=>assert.equal(await confirm.isEnabled(),true));
 assert.equal(uploads.length,4);assert.equal(uploads[3].status,200);assert.equal(uploads[2].sha,uploads[3].sha);assert.equal(forwarded[3].sha,uploads[3].sha);
 report.checks.push('real route provider error retains audio, blocks finalization, and retries identical bytes successfully');
 assert.deepEqual(errors,[]);await page.screenshot({path:resolve(out,'real-upload-contract.png')});report.status='passed';
} catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:resolve(out,'real-upload-contract-failure.png')}).catch(()=>{});}
finally{await browser.close();await new Promise(r=>server.close(r));writeFileSync(resolve(out,'transcription-contract-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
