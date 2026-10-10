// Native Chromium microphone + native modal + production editor and visit CSS.
// Uploads use the real route/middleware; external Auth and speech/AI are fixtures.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {transcriptionRoute} from '../tests/helpers/transcription-route.mjs';
const root=process.cwd(),out=resolve(root,'test-results/recorder');mkdirSync(out,{recursive:true});
function command(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r}
command('espeak-ng',['-v','el','-s','145','-w',resolve(out,'speech-source.wav'),'Συνθετικό περιστατικό δοκιμής. Ο ασθενής αναφέρει κόπωση. Δεν αναφέρει αϋπνία. Διατηρεί επαφή με φίλους. Δεν πρόκειται για πραγματικό ασθενή.']);
command('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',resolve(out,'speech-source.wav'),'-ac','1','-ar','48000',resolve(out,'synthetic-speech.wav')]);
await build({entryPoints:['browser-tests/clinical-recorder-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfigRaw:{compilerOptions:{baseUrl:root,paths:{'@/*':['./*']}}}});
// Shared by the recovery runner. Component and visit styles come from fixture.css.
const fixtureCSS=`*{box-sizing:border-box}body{margin:0;background:#e7edeb;color:#293e36;font:16px Arial,sans-serif}h1{font-size:22px;margin:24px 0}.test-only{font-size:10px;padding:5px;margin:8px 0}output{font-size:10px}.finalize-bar{display:flex;align-items:center;gap:12px}.visit-dialog-title>button{border:0;background:transparent;color:#356c59}.visit-dialog .finalize-bar{justify-content:flex-end}@media(max-width:600px){.visit-dialog .finalize-bar{flex-wrap:wrap;gap:6px}}`;
const html=`<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>${fixtureCSS}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
let config={},uploads=[],polishes=[];
const segments=['Ο ασθενής αναφέρει κόπωση. Δεν αναφέρει αϋπνία.','Διατηρεί επαφή με φίλους.'];
const realRoute=transcriptionRoute({provider:async({init})=>{
 const file=init.body.get('file');assert.ok(file instanceof File);
 const data=Buffer.from(await file.arrayBuffer()),filename=resolve(out,`capture-${Date.now()}-${uploads.length}.webm`);writeFileSync(filename,data);
 const decoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',filename,'-f','f32le','-ac','1','-ar','16000','pipe:1'],{maxBuffer:16*1024*1024});assert.equal(decoded.status,0,decoded.stderr.toString());
 const pcm=decoded.stdout;let sum=0;for(let n=0;n+4<=pcm.length;n+=4)sum+=pcm.readFloatLE(n)**2;
 uploads.push({bytes:data.length,mime:file.type,sha:createHash('sha256').update(data).digest('hex'),duration:pcm.length/4/16000,rms:Math.sqrt(sum/(pcm.length/4))});
 await new Promise(r=>setTimeout(r,config.transcriptionDelay??150));
 if(config.failTranscriptionOnce){config.failTranscriptionOnce=false;return Response.json({error:'synthetic-provider-failure'},{status:503})}
 const text=segments[Math.min(config.segment??0,1)];config.segment=(config.segment??0)+1;return Response.json({text});
}});
const server=createServer(async(req,res)=>{try{
 if(req.url==='/api/transcribe'){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
  const result=await realRoute.POST(new Request(`http://${req.headers.host}/api/transcribe`,{method:'POST',headers,body:Buffer.concat(chunks)}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
 }
 if(req.url==='/api/clinical/polish'){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());polishes.push(body);
  await new Promise(r=>setTimeout(r,config.polishDelay??100));res.writeHead(config.failPolish?502:200,{'content-type':'application/json'});res.end(JSON.stringify(config.failPolish?{error:'Συνθετική αστοχία AI.'}:{text:body.text.replace('αναφέρει κόπωση','αναφέρει αίσθημα κόπωσης'),model:'synthetic-fixture-not-live-ai'}));return;
 }
 if(req.url==='/fixture.js'||req.url==='/fixture.css'){res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'application/javascript');res.end(readFileSync(resolve(out,req.url.slice(1))));return}
 res.setHeader('content-type','text/html');res.end(html);
}catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:String(error)}))}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${resolve(out,'synthetic-speech.wav')}`]});
const report={commit:process.env.GITHUB_SHA||'local',scope:'Native modal dialog, production ClinicalTextField and visit stylesheet, real Chromium synthetic audio, real transcription route and middleware. External Auth/speech/AI and clinical persistence are fixtures.',tests:[],audio:[]};
const title='Κλινική αποτίμηση & ενέργειες',other='Προστατευτικοί παράγοντες',initial='Συνθετικό περιστατικό δοκιμής. Δεν αναφέρει αϋπνία.';
const field=p=>p.getByRole('textbox',{name:title,exact:true});
const mic=(p,name=title)=>p.getByRole('button',{name:'Υπαγόρευση: '+name,exact:true});
const ai=p=>p.getByRole('button',{name:'Βελτίωση διατύπωσης: '+title,exact:true});
const dock=p=>p.getByRole('region',{name:'Υπαγόρευση: '+title,exact:true});
async function until(fn){let error;for(let n=0;n<80;n++){try{await fn();return}catch(e){error=e}await new Promise(r=>setTimeout(r,100))}throw error}
async function start(p){await mic(p).click();await dock(p).getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).waitFor()}
async function finish(p){await dock(p).getByRole('button',{name:'Ολοκλήρωση υπαγόρευσης',exact:true}).click();await dock(p).waitFor({state:'detached'});await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).waitFor();await until(async()=>assert.equal(await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).isEnabled(),true))}
async function inlineAndClickable(p){
 await until(async()=>{
  const geometry=await dock(p).evaluate(el=>{
   const shell=el.closest('[data-writing-editor]'),text=shell?.querySelector('textarea'),dialog=el.closest('dialog');
   const a=el.getBoundingClientRect(),b=shell?.getBoundingClientRect(),t=text?.getBoundingClientRect();
   return {modal:!!dialog?.matches(':modal'),inside:!!b&&a.left>=b.left&&a.right<=b.right+1&&a.bottom<=b.bottom+1,below:!!t&&a.top>=t.bottom-1,position:getComputedStyle(el).position,hit:[...el.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})};
  });assert.equal(geometry.modal,true);assert.equal(geometry.inside,true);assert.equal(geometry.below,true);assert.equal(geometry.position,'static');assert.equal(geometry.hit,true,'recorder controls must receive pointer events inside the modal');
 });
}
async function scenario(name,viewport,run){config={};uploads=[];polishes=[];const context=await browser.newContext({viewport,permissions:['microphone']});const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.addInitScript(()=>{window.__media={events:[],streams:[]};const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{const s=await original(c);window.__media.streams.push(s);return s};const Native=window.MediaRecorder;window.MediaRecorder=class extends Native{constructor(...a){super(...a);['start','pause','resume','stop'].forEach(e=>this.addEventListener(e,()=>window.__media.events.push(e)))}}});
 try{await page.goto(origin);await field(page).waitFor();await run(page);assert.deepEqual(errors,[]);report.tests.push({name,status:'passed'});report.audio.push(...uploads.map(a=>({scenario:name,...a})))}catch(e){report.tests.push({name,status:'failed',error:String(e.stack||e)});await page.screenshot({path:resolve(out,`failure-${report.tests.length}.png`),fullPage:true}).catch(()=>{});console.error(name,e)}finally{await context.close()}
}
try{
 await scenario('native modal: inline recording / pause / resume / edit / append / AI review / undo',{width:1366,height:900},async p=>{
  assert.equal(await field(p).inputValue(),initial);await start(p);await p.waitForTimeout(1800);await inlineAndClickable(p);await p.screenshot({path:resolve(out,'desktop-recording.png')});
  assert.equal(await mic(p).getAttribute('aria-pressed'),'true');await p.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).click();assert.equal(await p.getByTestId('navigation').textContent(),'blocked');
  await dock(p).getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).click();const paused=await dock(p).locator('time').textContent();await p.waitForTimeout(1100);assert.equal(await dock(p).locator('time').textContent(),paused);
  await dock(p).getByRole('button',{name:'Συνέχιση υπαγόρευσης',exact:true}).click();await p.waitForTimeout(1200);await finish(p);assert.equal(uploads.length,1);assert.ok(uploads[0].bytes>800&&uploads[0].rms>0.0001&&uploads[0].duration>2);
  assert.equal(await p.evaluate(()=>window.qa.commits.length),0);const edited=(await field(p).inputValue())+'\nΧειροκίνητη διόρθωση δοκιμής.';await field(p).fill(edited);
  await start(p);await p.waitForTimeout(1300);await inlineAndClickable(p);assert.equal(await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).count(),0);await finish(p);assert.equal(await field(p).inputValue(),edited+'\n\n'+segments[1]);
  await p.screenshot({path:resolve(out,'inline-transcription-review.png')});await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).click();const accepted=await field(p).inputValue();await until(async()=>assert.equal(await p.evaluate(()=>window.qa.values.impression),accepted));assert.equal(await p.evaluate(()=>window.qa.commits.length),1);
  assert.equal(await p.getByRole('textbox').count(),2);assert.equal(await p.getByRole('dialog').count(),1);
  await ai(p).click();await p.getByRole('button',{name:'Αποδοχή',exact:true}).waitFor();await p.getByRole('button',{name:'Διατήρηση αρχικού',exact:true}).click();assert.equal(await field(p).inputValue(),accepted);
  await ai(p).click();await p.getByRole('button',{name:'Αποδοχή',exact:true}).waitFor();await p.screenshot({path:resolve(out,'inline-ai-review.png')});await p.getByRole('button',{name:'Αποδοχή',exact:true}).click();await p.getByRole('button',{name:'Αναίρεση',exact:true}).click();assert.equal(await field(p).inputValue(),accepted);
  await p.getByRole('button',{name:'Συνέχεια αργότερα',exact:true}).click();assert.equal(await p.getByTestId('navigation').textContent(),'safe');assert.equal(await p.evaluate(()=>window.__media.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 });
 await scenario('mobile native modal: controls stay inside editor, resize, safe cancellation',{width:390,height:844},async p=>{
  await start(p);await p.waitForTimeout(1200);await inlineAndClickable(p);await p.screenshot({path:resolve(out,'mobile-recording.png')});await p.setViewportSize({width:390,height:560});await inlineAndClickable(p);
  await dock(p).getByRole('button',{name:'Ακύρωση ηχογράφησης',exact:true}).click();await dock(p).getByRole('button',{name:'Πίσω',exact:true}).click();await dock(p).getByRole('button',{name:'Συνέχιση υπαγόρευσης',exact:true}).click();await p.waitForTimeout(400);
  await dock(p).getByRole('button',{name:'Ακύρωση ηχογράφησης',exact:true}).click();await dock(p).getByRole('button',{name:'Απόρριψη',exact:true}).click();assert.equal(await dock(p).count(),0);assert.equal(uploads.length,0);assert.equal(await field(p).inputValue(),initial);
 });
 await scenario('service failure: repeat upload uses identical audio without another recording',{width:1366,height:900},async p=>{
  config.failTranscriptionOnce=true;await start(p);await p.waitForTimeout(1300);await dock(p).getByRole('button',{name:'Ολοκλήρωση υπαγόρευσης',exact:true}).click();await p.getByRole('button',{name:'Νέα προσπάθεια μεταγραφής',exact:true}).waitFor();assert.equal(uploads.length,1);
  await p.getByRole('button',{name:'Νέα προσπάθεια μεταγραφής',exact:true}).click();await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).waitFor();assert.equal(uploads.length,2);assert.equal(uploads[0].sha,uploads[1].sha);assert.equal(await p.evaluate(()=>window.__media.streams.length),1);
 });
 await scenario('other fields cannot steal the active microphone',{width:1366,height:900},async p=>{await start(p);await mic(p,other).click();await p.getByRole('alert').waitFor();assert.equal(await p.evaluate(()=>window.__media.streams.length),1);await p.waitForTimeout(1200);await finish(p);assert.equal(await p.getByRole('textbox',{name:other,exact:true}).inputValue(),'')});
 await scenario('stale AI output cannot replace newer manual edits',{width:1366,height:900},async p=>{config.polishDelay=800;await ai(p).click();await field(p).fill(initial+' Νεότερη καταγραφή.');await p.getByRole('alert').waitFor();assert.equal(await field(p).inputValue(),initial+' Νεότερη καταγραφή.');assert.equal(await p.getByRole('button',{name:'Αποδοχή',exact:true}).count(),0)});
 await scenario('AI failure preserves original documentation',{width:1366,height:900},async p=>{config.failPolish=true;await ai(p).click();await p.getByRole('alert').waitFor();assert.equal(await field(p).inputValue(),initial);assert.equal(await p.evaluate(()=>window.qa.commits.length),0)});
 await scenario('microphone denied: visible inline error, no hidden recording',{width:1366,height:900},async p=>{await p.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Συνθετική άρνηση μικροφώνου.','NotAllowedError')}});await mic(p).click();await p.getByRole('alert').waitFor();assert.equal(await field(p).inputValue(),initial);assert.equal(await dock(p).count(),0)});
 await scenario('pending review survives modal reload; Escape/finalize remain guarded',{width:1366,height:900},async p=>{await start(p);await p.waitForTimeout(1300);await finish(p);const text=await field(p).inputValue();await p.reload();await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).waitFor();assert.equal(await field(p).inputValue(),text);assert.equal(await p.evaluate(()=>window.qa.values.impression),initial);await p.keyboard.press('Escape');assert.equal(await p.getByTestId('navigation').textContent(),'blocked');assert.equal(await p.locator('dialog:modal').count(),1);await p.getByRole('button',{name:'Ακύρωση',exact:true}).click();assert.equal(await field(p).inputValue(),initial)});
 await scenario('top-layer regression: an external body control is inert but the inline recorder is interactive',{width:1366,height:900},async p=>{
  await start(p);await p.waitForTimeout(900);await inlineAndClickable(p);
  const oldHidden=await p.evaluate(()=>{const b=document.createElement('button');b.textContent='old-portal';b.style.cssText='position:fixed;bottom:20px;right:20px;z-index:2147483647';document.body.append(b);b.focus();const r=b.getBoundingClientRect();const hidden=document.activeElement!==b&&!b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));b.remove();return hidden});assert.equal(oldHidden,true);
  const pause=dock(p).getByRole('button',{name:'Παύση υπαγόρευσης',exact:true});await pause.focus();assert.equal(await pause.evaluate(el=>document.activeElement===el),true);await p.keyboard.press('Enter');await dock(p).getByRole('button',{name:'Συνέχιση υπαγόρευσης',exact:true}).waitFor();await p.screenshot({path:resolve(out,'native-modal-keyboard.png')});
 });
}finally{await browser.close();await new Promise(r=>server.close(r));writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
if(report.tests.some(t=>t.status!=='passed'))process.exitCode=1;
