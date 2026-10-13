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
const interview=p=>p.getByRole('textbox',{name:'Λόγος προσέλευσης & παρούσα εικόνα *',exact:true});
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
  await p.locator('[data-visit-part="interview"]').getByRole('button',{name:'Υπαγόρευση: Λόγος προσέλευσης & παρούσα εικόνα *',exact:true}).click();const recorder=p.locator('[data-writing-recorder="inline"]');await recorder.getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).waitFor();await p.waitForTimeout(1300);await p.screenshot({path:resolve(out,'mobile-recording.png')});
  await recorder.getByRole('button',{name:'Παύση υπαγόρευσης',exact:true}).click();await recorder.getByRole('button',{name:'Συνέχιση υπαγόρευσης',exact:true}).click();await p.waitForTimeout(500);await recorder.getByRole('button',{name:'Ολοκλήρωση υπαγόρευσης',exact:true}).click();await p.getByRole('button',{name:'Επιβεβαίωση',exact:true}).waitFor();assert.ok((await interview(p).inputValue()).endsWith('Συνθετική προσθήκη για έλεγχο.'));assert.equal(await p.getByRole('dialog').count(),0);await p.getByRole('button',{name:'Ακύρωση',exact:true}).click();assert.ok(!(await interview(p).inputValue()).includes('Συνθετική προσθήκη'));
 });
 await check('follow-up retains its editor, structured MSE and no global unassessed shortcut',{width:1280,height:1000},'/?followup=1',async p=>{
  await p.locator('[data-clinical-followup]').waitFor();
  const plan=p.locator('[data-followup-plan-group="true"]');
  await plan.waitFor();
  assert.equal(await plan.locator('textarea').count(),2,'two saved fields inside one treatment/review group');
  assert.equal(await p.locator('[data-followup-adherence-group="true"]').count(),0);
  assert.equal(await p.getByText('Σημερινή ανασκόπηση λήψης',{exact:true}).count(),0);
  assert.equal(await p.getByText('Τι αξίζει να θυμόμαστε',{exact:true}).count(),0);
  assert.equal(await p.getByRole('button',{name:'Δεν αξιολογήθηκε σήμερα',exact:true}).count(),0);assert.equal(await p.getByText('Οδηγός ενότητας',{exact:true}).count(),0);await p.getByRole('button',{name:'Καταγραφή αλλαγής σε ενότητα MSE',exact:true}).click();assert.equal(await mse(p).locator('[data-mse-domain]').count(),12);await p.screenshot({path:resolve(out,'followup.png')});
 });

 async function assertGroupedSections(p,{history=true}={}){
  const keys=['risk',...(history?['history']:[]),'assessment','medication','plan','appointment'];
  const sample=await p.locator('.mse-columns').boundingBox();assert.ok(sample);
  const mseStyle=await p.locator('.mse-columns').evaluate(e=>{const s=getComputedStyle(e);return {background:s.backgroundColor,border:s.borderTopColor,radius:s.borderTopLeftRadius}});
  for(const key of keys){
   const section=p.locator('[data-visit-part="'+key+'"]');
   // Initial assessment already uses a single inline editor, not a grouped panel.
   // Preserve that deployed layout instead of requiring a new surrounding box.
   if(key==='assessment'&&await section.getAttribute('class')==='first-assessment-impression'){
    assert.equal(await section.locator(':scope > h3').count(),1);
    assert.equal(await section.getByRole('textbox',{name:'Κλινική εκτίμηση',exact:true}).count(),1);
    assert.equal(await section.locator(':scope > .visit-part-surface').count(),0);
    const box=await section.boundingBox();assert.ok(box&&Math.abs(box.x-sample.x)<=1&&Math.abs(box.width-sample.width)<=1,'inline assessment alignment');
    continue;
   }
   const body=section.locator(':scope > .visit-part-surface');assert.equal(await body.count(),1,key+' needs a single grouped body');
   const header=section.locator(':scope > header');assert.equal(await header.count(),1,key+' external header');
   const box=await body.boundingBox(),heading=await header.boundingBox();assert.ok(box&&heading);
   assert.ok(heading.y+heading.height<=box.y+1,key+' heading must be outside');
   assert.ok(Math.abs(box.x-sample.x)<=1,key+' left edge');assert.ok(Math.abs(box.width-sample.width)<=1,key+' width');
   const style=await body.evaluate(e=>{const s=getComputedStyle(e);return {background:s.backgroundColor,border:s.borderTopColor,radius:s.borderTopLeftRadius,width:s.borderTopWidth}});
   assert.equal(style.background,mseStyle.background,key+' same cream');assert.equal(style.border,mseStyle.border,key+' same border');assert.equal(style.radius,mseStyle.radius,key+' same radius');assert.equal(style.width,'1px',key+' visible group border');
  }
 }
 await check('single interview heading keeps named field and inline mic/AI, with no duplicate label',{width:1440,height:1000},'/',async p=>{
  const section=p.locator('[data-visit-part="interview"]');const name='Λόγος προσέλευσης & παρούσα εικόνα *';
  assert.equal(await section.getByRole('heading').count(),1);await section.getByRole('heading',{name,exact:true}).waitFor();
  assert.equal(await section.getByText('Αναφορά ασθενούς & συμπτώματα *',{exact:true}).count(),0);
  assert.equal(await section.getByRole('textbox',{name,exact:true}).count(),1);
  assert.equal(await section.getByRole('button',{name:'Υπαγόρευση: '+name,exact:true}).count(),1);
  assert.equal(await section.getByRole('button',{name:'Βελτίωση διατύπωσης: '+name,exact:true}).count(),1);
  assert.equal(await section.locator('.visit-part-surface').count(),0,'no outer box around the single editor');
  const before=await interview(p).inputValue();await interview(p).fill(before+' Χειροκίνητη προσθήκη.');await interview(p).blur();await p.waitForTimeout(1000);
  const write=await p.evaluate(()=>window.clinicalQA.writes.find(w=>w.action==='save_section'&&w.section_key==='interview'));
  assert.ok(write);assert.equal(write.expected_version,1);assert.equal(write.content,before+' Χειροκίνητη προσθήκη.');
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:resolve(out,'sections-desktop.png')});
 });
 await check('desktop: every complex section matches MSE panel and history row alignment',{width:1440,height:1000},'/',async p=>{
  await assertGroupedSections(p);
  const fields=p.locator('[data-visit-part="history"] .history-question textarea');assert.equal(await fields.count(),8);
  for(let i=0;i<8;i+=2){const a=await fields.nth(i).boundingBox(),b=await fields.nth(i+1).boundingBox();assert.ok(a&&b);assert.ok(Math.abs(a.y-b.y)<=1,'same history row baseline');assert.ok(Math.abs(a.width-b.width)<=1,'equal history columns');}
  for(const key of ['mse','risk','history','assessment','plan']){await p.locator('[data-visit-part="'+key+'"]').scrollIntoViewIfNeeded();await p.screenshot({path:resolve(out,'sections-'+key+'.png')});}
  assert.equal(await p.evaluate(()=>window.clinicalQA.writes.length),0,'layout must not create clinical writes');
 });
 await check('mobile: grouped risk/history/assessment fit and retain external headings',{width:390,height:844},'/',async p=>{
  await assertGroupedSections(p);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const fields=p.locator('[data-visit-part="history"] .history-question textarea');for(let i=0;i<8;i++){const b=await fields.nth(i).boundingBox();assert.ok(b&&b.x>=0&&b.x+b.width<=390,'history input on screen');}
  await p.locator('[data-visit-part="risk"]').scrollIntoViewIfNeeded();await p.screenshot({path:resolve(out,'sections-mobile-risk.png')});
  await p.locator('[data-visit-part="history"]').scrollIntoViewIfNeeded();await p.screenshot({path:resolve(out,'sections-mobile-history.png')});
 });
 await check('follow-up: compact grouped panels and detailed session keep common layout',{width:1280,height:1000},'/?followup=1',async p=>{
  const closure=p.locator('[data-clinical-followup]');await closure.waitFor();
  const risk=closure.locator('details').filter({has: p.locator('summary').filter({hasText:/^Κίνδυνος ·/})}).first();
  const panel=risk.locator(':scope > .visit-part-surface');assert.equal(await panel.count(),1);assert.equal(await panel.evaluate(e=>getComputedStyle(e).borderTopWidth),'1px');
  const summary=await risk.locator(':scope>summary').boundingBox(),body=await panel.boundingBox();assert.ok(summary&&body&&summary.y+summary.height<=body.y+1);
  await p.screenshot({path:resolve(out,'sections-followup.png')});
  await p.getByRole('button',{name:/^Αναλυτική καταγραφή/}).click();await p.getByRole('heading',{name:'Επανεξέταση',exact:true}).waitFor();
  await assertGroupedSections(p,{history:false});assert.equal(await p.locator('[data-visit-part="interview"]').getByRole('heading').count(),1);
 });
}finally{await browser.close();await new Promise(r=>server.close(r));writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
if(report.tests.some(t=>t.status!=='passed'))process.exitCode=1;
