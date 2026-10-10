// Real Chromium getUserMedia/MediaRecorder, synthetic Greek speech, fixture APIs.
// No OpenAI credentials, Supabase calls or production patient writes are used.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=process.cwd(),out=resolve(root,'test-results/recorder');mkdirSync(out,{recursive:true});
const speech='Συνθετικό περιστατικό δοκιμής. Ο ασθενής αναφέρει κόπωση. Δεν αναφέρει αϋπνία. Διατηρεί επαφή με φίλους. Δεν πρόκειται για πραγματικό ασθενή.';
function command(cmd,args){const result=spawnSync(cmd,args,{encoding:'utf8'});assert.equal(result.status,0,`${cmd}: ${result.stderr}`);return result}
command('espeak-ng',['-v','el','-s','145','-w',resolve(out,'speech-source.wav'),speech]);
command('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',resolve(out,'speech-source.wav'),'-ac','1','-ar','48000',resolve(out,'synthetic-speech.wav')]);
await build({entryPoints:['browser-tests/clinical-recorder-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfigRaw:{compilerOptions:{baseUrl:root,paths:{'@/*':['./*']}}}});
const fixtureCSS=`*{box-sizing:border-box}body{margin:0;background:#f8f6f1;color:#293e36;font:16px Arial,sans-serif}.visit-dialog{position:relative;transform:translateZ(0);max-width:980px;margin:25px auto 180px;padding:24px}.visit-part{background:white;border:1px solid #dce5df;border-radius:20px;padding:25px;margin:20px 0}.visit-part h3{margin:0 0 24px}h1{font-size:21px}p{font-size:13px;color:#627b6d}textarea{min-height:110px;border:1px solid #d8e4dc;border-radius:12px;background:white;padding:14px;font:16px/1.6 Arial,sans-serif}.finalize-bar{position:fixed;left:20px;right:20px;bottom:0;z-index:50;display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:14px 20px;background:#f6f9f6;border:1px solid #dce5df;border-radius:16px}.finalize-bar button{padding:15px;border:1px solid #cdded4;border-radius:10px;background:white;color:#2d6b57;font-weight:600}.finalize-bar button:first-child{background:#2f7763;color:white}.test-only{position:fixed;top:3px;left:3px;z-index:1500;font-size:9px}output{font-size:10px}@media(max-width:600px){.visit-dialog{padding:12px;margin:24px 0 180px}.visit-part{padding:18px}.finalize-bar{left:8px;right:8px;flex-wrap:wrap;padding:9px;gap:6px}.finalize-bar button{font-size:11px;padding:12px}}`;
const html=`<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>${fixtureCSS}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
let config={},uploads=[],polishes=[];
const segments=['Ο ασθενής αναφέρει κόπωση. Δεν αναφέρει αϋπνία.','Διατηρεί επαφή με φίλους.'];
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/api/transcribe'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request('http://localhost/api/transcribe',{method:'POST',headers:{'content-type':req.headers['content-type']},body:Buffer.concat(chunks)});
   const form=await request.formData(),file=form.get('audio');assert.ok(file&&typeof file.arrayBuffer==='function');
   const data=Buffer.from(await file.arrayBuffer());const filename=resolve(out,`capture-${Date.now()}-${uploads.length}.webm`);writeFileSync(filename,data);
   const decoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',filename,'-f','f32le','-ac','1','-ar','16000','pipe:1'],{maxBuffer:16*1024*1024});
   assert.equal(decoded.status,0,decoded.stderr.toString());const pcm=decoded.stdout;let sum=0;for(let n=0;n+4<=pcm.length;n+=4)sum+=pcm.readFloatLE(n)**2;
   uploads.push({bytes:data.length,mime:file.type,sha:createHash('sha256').update(data).digest('hex'),duration:pcm.length/4/16000,rms:Math.sqrt(sum/(pcm.length/4))});
   await new Promise(r=>setTimeout(r,config.transcriptionDelay??150));
   if(config.failTranscriptionOnce){config.failTranscriptionOnce=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Συνθετική αστοχία μεταγραφής. Ο ήχος διατηρείται.'}));return}
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({text:segments[Math.min((config.segment??0),1)]}));config.segment=(config.segment??0)+1;return;
  }
  if(req.url==='/api/clinical/polish'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());polishes.push(body);
   await new Promise(r=>setTimeout(r,config.polishDelay??100));
   res.writeHead(config.failPolish?502:200,{'Content-Type':'application/json'});res.end(JSON.stringify(config.failPolish?{error:'Συνθετική αστοχία AI.'}:{text:body.text.replace('αναφέρει κόπωση','αναφέρει αίσθημα κόπωσης'),model:'synthetic-fixture-not-live-ai'}));return;
  }
  if(req.url==='/fixture.js'||req.url==='/fixture.css'){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'application/javascript');res.end(readFileSync(resolve(out,req.url.slice(1))));return}
  res.setHeader('Content-Type','text/html');res.end(html);
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:String(error)}))}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${resolve(out,'synthetic-speech.wav')}`]});
const report={commit:process.env.GITHUB_SHA||'local',scope:'Real browser recorder, synthetic speech and deterministic transcription/polish fixture APIs. Not live speech recognition or authenticated patient persistence.',tests:[],audio:[]};
const title='Κλινική αποτίμηση & ενέργειες',other='Προστατευτικοί παράγοντες',initial='Συνθετικό περιστατικό δοκιμής. Δεν αναφέρει αϋπνία.';
const field=p=>p.getByRole('textbox',{name:title,exact:true});
const mic=(p,name=title)=>p.getByRole('button',{name:'Υπαγόρευση: '+name,exact:true});
const ai=p=>p.getByRole('button',{name:'Βελτίωση διατύπωσης: '+title,exact:true});
const dock=p=>p.getByRole('region',{name:'Υπαγόρευση: '+title,exact:true});
async function until(fn){let error;for(let n=0;n<60;n++){try{await fn();return}catch(e){error=e}await new Promise(r=>setTimeout(r,100))}throw error}
async function start(p){await mic(p).click();await dock(p).getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).waitFor()}
async function finish(p){await dock(p).getByRole('button',{name:'Ολοκλήρωση υπαγόρευσης',exact:true}).click();await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).waitFor()}
async function noOverlap(p){await until(async()=>{const a=await dock(p).boundingBox(),b=await p.getByTestId('footer').boundingBox();assert.ok(a&&b);assert.ok(a.y+a.height<=b.y-8||a.x>=b.x+b.width||a.x+a.width<=b.x,'recorder overlaps footer');const v=p.viewportSize();assert.ok(a.x>=0&&a.x+a.width<=v.width+1&&a.y>=0&&a.y+a.height<=v.height+1,'recorder outside viewport')})}
async function scenario(name,viewport,run){
 config={};uploads=[];polishes=[];const context=await browser.newContext({viewport,permissions:['microphone']});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 await page.addInitScript(()=>{
  window.__media={events:[],streams:[]};const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);window.__media.streams.push(stream);return stream};
  const Native=window.MediaRecorder;window.MediaRecorder=class extends Native{constructor(...args){super(...args);['start','pause','resume','stop'].forEach(event=>this.addEventListener(event,()=>window.__media.events.push(event)))}};
 });
 try{await page.goto(origin);await field(page).waitFor();await run(page);assert.deepEqual(errors,[]);report.tests.push({name,status:'passed'});report.audio.push(...uploads.map(a=>({scenario:name,...a})))}
 catch(error){report.tests.push({name,status:'failed',error:String(error.stack||error)});await page.screenshot({path:resolve(out,`failure-${report.tests.length}.png`),fullPage:true}).catch(()=>{});console.error(name,error)}
 finally{await context.close()}
}
try{
 await scenario('record / pause / resume / append / manual edit / AI review and undo',{width:1366,height:900},async p=>{
  assert.equal(await field(p).inputValue(),initial);assert.equal(await p.getByRole('button',{name:'Βελτίωση διατύπωσης: '+other,exact:true}).isDisabled(),true);
  await start(p);await p.waitForTimeout(2200);await noOverlap(p);assert.equal(await dock(p).evaluate(el=>el.parentElement===document.body),true);
  assert.equal(await mic(p).getAttribute('aria-pressed'),'true');await p.screenshot({path:resolve(out,'desktop-recording.png')});
  await p.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).click();assert.equal(await p.getByTestId('navigation').textContent(),'blocked');
  await p.getByRole('button',{name:'QA αλλαγή ύψους μπάρας',exact:true}).click();await noOverlap(p);
  await dock(p).getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).click();const paused=await dock(p).locator('time').textContent();await p.waitForTimeout(1400);assert.equal(await dock(p).locator('time').textContent(),paused);
  await dock(p).getByRole('button',{name:'Συνέχιση υπαγόρευσης',exact:true}).click();await p.waitForTimeout(1300);await finish(p);
  assert.equal(uploads.length,1);assert.ok(uploads[0].bytes>800&&uploads[0].duration>2.5&&uploads[0].duration<7&&uploads[0].rms>0.0001);
  assert.equal(await p.evaluate(()=>window.qa.values.impression),initial);assert.equal(await p.evaluate(()=>window.qa.commits.length),0);
  const edited=(await field(p).inputValue())+'\nΧειροκίνητη διόρθωση δοκιμής.';await field(p).fill(edited);
  await start(p);await p.waitForTimeout(1400);await finish(p);assert.equal(uploads.length,2);assert.equal(await field(p).inputValue(),edited+'\n\n'+segments[1]);
  await p.screenshot({path:resolve(out,'inline-transcription-review.png')});await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).click();
  const accepted=await field(p).inputValue();await until(async()=>assert.equal(await p.evaluate(()=>window.qa.values.impression),accepted));assert.equal(await p.evaluate(()=>window.qa.commits.length),1);
  assert.equal(await p.getByRole('textbox').count(),2);assert.equal(await p.getByRole('dialog').count(),0);
  await ai(p).click();await p.getByRole('button',{name:'Αποδοχή',exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.qa.values.impression),accepted);
  await p.getByRole('button',{name:'Διατήρηση αρχικού',exact:true}).click();assert.equal(await field(p).inputValue(),accepted);
  await ai(p).click();await p.getByRole('button',{name:'Αποδοχή',exact:true}).waitFor();await p.screenshot({path:resolve(out,'inline-ai-review.png')});await p.getByRole('button',{name:'Αποδοχή',exact:true}).click();await p.getByRole('button',{name:'Αναίρεση',exact:true}).click();assert.equal(await field(p).inputValue(),accepted);
  await p.getByRole('button',{name:'Συνέχεια αργότερα',exact:true}).click();assert.equal(await p.getByTestId('navigation').textContent(),'safe');
  const media=await p.evaluate(()=>({events:window.__media.events,ended:window.__media.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))}));assert.ok(media.events.includes('pause')&&media.events.includes('resume'));assert.equal(media.ended,true);
 });
 await scenario('mobile / viewport resize / footer resize / safe cancellation',{width:390,height:844},async p=>{
  await start(p);await p.waitForTimeout(1200);await noOverlap(p);await p.screenshot({path:resolve(out,'mobile-recording.png')});
  await p.setViewportSize({width:390,height:560});await noOverlap(p);await p.getByRole('button',{name:'QA αλλαγή ύψους μπάρας',exact:true}).click();await noOverlap(p);
  await dock(p).getByRole('button',{name:'Ακύρωση ηχογράφησης',exact:true}).click();await dock(p).getByText('Απόρριψη ήχου;', {exact:true}).waitFor();assert.equal(uploads.length,0);assert.equal(await field(p).inputValue(),initial);await noOverlap(p);
  await dock(p).getByRole('button',{name:'Πίσω',exact:true}).click();await dock(p).getByRole('button',{name:'Συνέχιση υπαγόρευσης',exact:true}).waitFor();
  await dock(p).getByRole('button',{name:'Ακύρωση ηχογράφησης',exact:true}).click();await dock(p).getByRole('button',{name:'Απόρριψη',exact:true}).click();await until(async()=>assert.equal(await dock(p).count(),0));
  assert.equal(await field(p).inputValue(),initial);assert.equal(uploads.length,0);await until(async()=>assert.equal(await p.evaluate(()=>window.__media.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true));
 });
 await scenario('transcription failure retries the identical captured audio without re-recording',{width:1366,height:900},async p=>{
  config.failTranscriptionOnce=true;await start(p);await p.waitForTimeout(1400);await dock(p).getByRole('button',{name:'Ολοκλήρωση υπαγόρευσης',exact:true}).click();await p.getByRole('button',{name:'Νέα προσπάθεια μεταγραφής',exact:true}).waitFor();assert.equal(await field(p).inputValue(),initial);
  await p.getByRole('button',{name:'Νέα προσπάθεια μεταγραφής',exact:true}).click();await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).waitFor();assert.equal(uploads.length,2);assert.equal(uploads[0].sha,uploads[1].sha);assert.equal(await p.evaluate(()=>window.__media.streams.length),1);
  await p.getByRole('button',{name:'Ακύρωση',exact:true}).click();assert.equal(await field(p).inputValue(),initial);
 });
 await scenario('other fields cannot steal the active microphone',{width:1366,height:900},async p=>{
  await start(p);await mic(p,other).click();await p.getByRole('alert').waitFor();assert.equal(await p.evaluate(()=>window.__media.streams.length),1);await p.waitForTimeout(1200);await finish(p);assert.equal(await p.getByRole('textbox',{name:other,exact:true}).inputValue(),'');assert.ok((await field(p).inputValue()).includes(segments[0]));
 });
 await scenario('stale AI output never overwrites newer manual edits',{width:1366,height:900},async p=>{
  config.polishDelay=900;await ai(p).click();await field(p).fill(initial+' Νεότερη χειροκίνητη καταγραφή.');await p.getByRole('alert').waitFor();assert.equal(await field(p).inputValue(),initial+' Νεότερη χειροκίνητη καταγραφή.');assert.equal(await p.getByRole('button',{name:'Αποδοχή',exact:true}).count(),0);
 });
 await scenario('AI service failure preserves the original field',{width:1366,height:900},async p=>{
  config.failPolish=true;await ai(p).click();await p.getByRole('alert').waitFor();assert.equal(await field(p).inputValue(),initial);assert.equal(await p.evaluate(()=>window.qa.commits.length),0);
 });
 await scenario('microphone permission denial leaves existing documentation untouched',{width:1366,height:900},async p=>{
  await p.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Συνθετική άρνηση μικροφώνου.','NotAllowedError')}});await mic(p).click();await p.getByRole('alert').waitFor();assert.equal(await field(p).inputValue(),initial);assert.equal(await dock(p).count(),0);
 });
 await scenario('pending dictation survives reload and remains unconfirmed',{width:1366,height:900},async p=>{
  await start(p);await p.waitForTimeout(1300);await finish(p);const text=await field(p).inputValue();await p.reload();await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).waitFor();assert.equal(await field(p).inputValue(),text);assert.equal(await p.evaluate(()=>window.qa.values.impression),initial);assert.equal(await p.evaluate(()=>window.qa.commits.length),0);
  await p.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).click();assert.equal(await p.getByTestId('navigation').textContent(),'blocked');await p.getByRole('button',{name:'Ακύρωση',exact:true}).click();assert.equal(await field(p).inputValue(),initial);
 });
}finally{
 await browser.close();await new Promise(r=>server.close(r));writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
if(report.tests.some(t=>t.status!=='passed'))process.exitCode=1;
