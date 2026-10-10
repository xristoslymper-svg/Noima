// Real PatientSession/editors/styles; synthetic fixture persistence and provider responses only.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/clinical-cleanup');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/clinical-cleanup-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},tsconfigRaw:{compilerOptions:{baseUrl:process.cwd(),paths:{'@/*':['./*']}}}});
// Synthetic tone exercises the native recorder, not speech recognition accuracy.
const frames=48000*8,wav=Buffer.alloc(44+frames*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)wav.writeInt16LE(Math.round(8000*Math.sin(i*2*Math.PI*330/48000)),44+i*2);writeFileSync(resolve(out,'synthetic.wav'),wav);
const html='<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#f8f6f1}.qa-clinical-shell{max-width:1060px;margin:0 auto;padding:24px}.qa-disclaimer{font-size:11px;color:#617467;margin-bottom:20px}@media(max-width:760px){.qa-clinical-shell{padding:12px}}</style><div id="root"></div><script src="/fixture.js"></script></html>';
const server=createServer((req,res)=>{if(req.url==='/fixture.js'||req.url==='/fixture.css'){res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(resolve(out,req.url.slice(1))));return}res.setHeader('content-type','text/html');res.end(html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${resolve(out,'synthetic.wav')}`]});
const report={commit:process.env.GITHUB_SHA||'local',scope:'Actual PatientSession and clinical components with real CSS. Synthetic fixture patient, persistence and transcription/AI responses. Not live-provider or Supabase verification.',tests:[]};
async function check(name,viewport,path,run){const context=await browser.newContext({viewport,permissions:['microphone']});const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER',e.stack)});page.on('dialog',d=>d.accept());await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());try{await page.goto(origin+path);await page.locator('.visit-workspace').waitFor();await run(page);assert.deepEqual(errors,[]);report.tests.push({name,status:'passed'})}catch(e){report.tests.push({name,status:'failed',error:String(e.stack||e),errors});await page.screenshot({path:resolve(out,`failure-${report.tests.length}.png`),fullPage:true});}finally{await context.close()}}
const interview=p=>p.locator('[data-visit-part="interview"] textarea');
const mse=p=>p.locator('.mse-columns');
try{
 await check('desktop: outside headings, ivory editors, quiet MSE, accessible provenance',{width:1280,height:1000},'/',async p=>{
  await interview(p).waitFor();assert.equal(await p.getByText('Εναλλακτική καταγραφή MSE',{exact:true}).count(),0);assert.equal(await p.getByText('Οδηγός ενότητας',{exact:true}).count(),0);
  assert.equal(await mse(p).locator('[aria-pressed="true"]').count(),0);
  const colors=await p.evaluate(()=>({editor:getComputedStyle(document.querySelector('[data-writing-editor]')).backgroundColor,mse:getComputedStyle(document.querySelector('.mse-columns')).backgroundColor,outer:getComputedStyle(document.querySelector('[data-visit-part="interview"]')).backgroundColor}));
  assert.equal(colors.editor,colors.mse);assert.equal(colors.outer,'rgba(0, 0, 0, 0)');
  const provenance=p.locator('.clinical-provenance>summary');assert.equal((await provenance.innerText()).trim(),'›');await provenance.focus();await p.keyboard.press('Space');assert.equal(await p.locator('.clinical-provenance').getAttribute('open'),'');await p.getByText('Μεταγραφή: Αυτούσια συνθετική υπαγόρευση.').waitFor();await p.keyboard.press('Space');
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:resolve(out,'desktop-overview.png')});
  await mse(p).scrollIntoViewIfNeeded();await p.screenshot({path:resolve(out,'desktop-mse.png')});
  assert.equal(await p.evaluate(()=>window.clinicalQA.writes.length),0);
 });
 await check('MSE selection then clearing stays empty, not normal; values and save contract retained',{width:1280,height:1000},'/',async p=>{
  const mood=p.locator('[data-mse-domain="mood"]');await mood.locator(':scope>summary').click();const choice=mood.locator('.mse-options button').first();await choice.click();assert.equal(await choice.getAttribute('aria-pressed'),'true');await mood.getByRole('button',{name:/Εκκαθάριση επιλογών:/}).click();
  assert.equal(await mood.locator('[aria-pressed="true"]').count(),0);assert.equal((await mood.locator('.mse-domain-preview').innerText()).trim(),'');
  await p.waitForTimeout(1000);const writes=await p.evaluate(()=>window.clinicalQA.writes);assert.ok(writes.some(w=>w.action==='save_document'&&w.section_key==='mse'));const doc=writes.filter(w=>w.section_key==='mse').at(-1).document;assert.equal(doc.fields.find(f=>f.key==='mood').text,'');assert.equal(doc.fields.find(f=>f.key==='mood').review,'not_assessed');assert.ok(doc.fields.every(f=>!f.text.trim()));
 });
 await check('legacy formulation and narrative MSE remain recoverable without alternative editors',{width:1280,height:1000},'/?legacy=1',async p=>{
  const legacy=p.locator('.assessment-legacy-notes');await legacy.locator('summary').click();await legacy.getByRole('textbox').waitFor();assert.equal(await legacy.getByRole('textbox').inputValue(),'Προϋπάρχουσα κλινική σημείωση — να διατηρηθεί αυτούσια.');
  assert.equal(await p.locator('.visit-assessment-additional').getByText('Διατύπωση περίπτωσης',{exact:true}).count(),0);
  const oldMse=p.locator('[data-mse-domain="legacy"]');await oldMse.locator(':scope>summary').click();assert.equal(await oldMse.locator('textarea').inputValue(),'Παλαιότερη αφηγηματική παρατήρηση.');
  assert.equal(await p.evaluate(()=>window.clinicalQA.writes.length),0);await legacy.scrollIntoViewIfNeeded();await p.screenshot({path:resolve(out,'legacy-notes.png')});
 });
 await check('mobile: usable widths and same-editor recorder pause/resume/transcription',{width:390,height:844},'/',async p=>{
  await interview(p).waitFor();await p.screenshot({path:resolve(out,'mobile-overview.png')});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.locator('[data-visit-part="interview"]').getByRole('button',{name:/^Υπαγόρευση:/}).click();const recorder=p.locator('[data-writing-recorder="inline"]');await recorder.getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).waitFor();await p.waitForTimeout(1300);await p.screenshot({path:resolve(out,'mobile-recording.png')});
  await recorder.getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).click();await recorder.getByRole('button',{name:'Συνέχιση υπαγόρευσης',exact:true}).click();await p.waitForTimeout(500);await recorder.getByRole('button',{name:'Ολοκλήρωση υπαγόρευσης',exact:true}).click();await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).waitFor();assert.ok((await interview(p).inputValue()).endsWith('Συνθετική προσθήκη για έλεγχο.'));assert.equal(await p.getByRole('dialog').count(),0);await p.getByRole('button',{name:'Ακύρωση',exact:true}).click();assert.ok(!(await interview(p).inputValue()).includes('Συνθετική προσθήκη'));
 });
 await check('follow-up retains its editor, structured MSE and no global unassessed shortcut',{width:1280,height:1000},'/?followup=1',async p=>{
  await p.locator('[data-clinical-followup]').waitFor();assert.equal(await p.getByRole('button',{name:'Δεν αξιολογήθηκε σήμερα',exact:true}).count(),0);assert.equal(await p.getByText('Οδηγός ενότητας',{exact:true}).count(),0);await p.getByRole('button',{name:'Καταγραφή αλλαγής σε ενότητα MSE',exact:true}).click();assert.equal(await mse(p).locator('[data-mse-domain]').count(),12);await p.screenshot({path:resolve(out,'followup.png')});
 });
}finally{await browser.close();await new Promise(r=>server.close(r));writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
if(report.tests.some(t=>t.status!=='passed'))process.exitCode=1;
