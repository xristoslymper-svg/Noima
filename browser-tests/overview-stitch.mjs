import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const out=resolve('test-results/overview-stitch');
mkdirSync(out,{recursive:true});
await build({
 entryPoints:['browser-tests/overview-stitch-fixture.tsx'],bundle:true,
 outfile:resolve(out,'fixture.js'),platform:'browser',format:'iife',jsx:'automatic',
 define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},
 tsconfigRaw:{compilerOptions:{baseUrl:process.cwd(),paths:{'@/*':['./*']}}},
 plugins:[{
   name:'fixture-next-link',
   setup(build){
     build.onResolve({filter:/^next\/link$/},()=>({path:'next-link-stub',namespace:'fixture-link'}));
     build.onLoad({filter:/.*/,namespace:'fixture-link'},()=>({
       contents:"import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}",
       loader:'jsx',resolveDir:process.cwd()
     }));
   }
 }]
});
const html='<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>';
const server=createServer((req,res)=>{
 if(['/fixture.js','/fixture.css'].includes(req.url)){
   res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');
   res.end(readFileSync(resolve(out,req.url.slice(1))));return;
 }
 res.setHeader('content-type','text/html');res.end(html);
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const report={scope:'Real DailyAgenda component and Overview CSS; synthetic appointments and simple synthetic briefing area. No authenticated real data, no patient writes or live AI.',checks:[]};
async function check(name,count,width,height,run){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(origin+'/?count='+count);
  await page.locator('.overview-agenda').waitFor();await page.waitForTimeout(250);
  await run(page);
  assert.deepEqual(errors,[]);
  report.checks.push({name,status:'passed'});
 }catch(e){
  const err=String(e.stack||e);report.checks.push({name,status:'failed',error:err,errors});
  await page.screenshot({path:resolve(out,'error-'+report.checks.length+'.png'),fullPage:true});
 }finally{await context.close()}
}
try{
 for(const n of [0,1,5,12]){
  await check('desktop '+n+' appointments',n,1600,1000,async p=>{
   assert.equal(await p.locator('.overview-appointment').count(),n);
   const bounding=await p.evaluate(()=>{
    const first=document.querySelector('.overview-stitch-sessions').getBoundingClientRect();
    const second=document.querySelector('.overview-stitch-grid>.ai-brief').getBoundingClientRect();
    return {agenda:first.width,brief:second.width,agendaTop:first.top,briefTop:second.top,fullScroll:document.documentElement.scrollWidth,viewport:window.innerWidth};
   });
   assert.ok(Math.abs(bounding.brief/bounding.agenda-1.5)<.07,JSON.stringify(bounding));
   assert.ok(Math.abs(bounding.agendaTop-bounding.briefTop)<2);
   assert.ok(bounding.fullScroll<=bounding.viewport+1,JSON.stringify(bounding));
   assert.equal(await p.locator('.metric-grid>.metric').count(),4);
   const list=p.locator('.overview-agenda-list');
   if(n===0){assert.equal(await list.count(),0);await p.getByText('Δεν υπάρχουν ραντεβού σήμερα.').waitFor();}
   else{
    assert.equal(await list.getAttribute('role'),'list');
    assert.equal(await p.locator('.overview-appointment-select[aria-pressed="true"]').count(),1);
    assert.equal(await p.locator('.overview-appointment-folder').count(),n);
    const scroll=await list.evaluate(el=>({scrollHeight:el.scrollHeight,height:el.clientHeight,hasScroll:el.classList.contains('is-scrollable')}));
    assert.equal(scroll.hasScroll,n>=5,JSON.stringify(scroll));
    if(n>=5)assert.ok(scroll.scrollHeight>scroll.height,JSON.stringify(scroll));
    if(n<5)assert.ok(scroll.scrollHeight<=scroll.height+1,JSON.stringify(scroll));
    if(n>=5){
      const buttons=p.locator('.overview-appointment-select');
      await buttons.nth(4).click();
      assert.equal(await buttons.nth(4).getAttribute('aria-pressed'),'true');
      assert.match(await p.locator('.ai-brief').getAttribute('data-brief-for'),/000000000005$/);
      await buttons.nth(1).focus();await p.keyboard.press('Enter');
      assert.equal(await buttons.nth(1).getAttribute('aria-pressed'),'true');
    }
    assert.equal(await p.locator('.overview-appointment-folder').first().getAttribute('href'),'/patients/demo/40000000-0000-4000-8000-000000000001?appointment=appointment-0');
   }
   const file=n===0?'zero-desktop.png':n===1?'one-desktop.png':n===12?'twelve-desktop.png':null;
   if(file)await p.screenshot({path:resolve(out,file),fullPage:true});
  });
 }
 for(const n of [0,1,5,12]){
  await check('mobile '+n+' appointments',n,390,844,async p=>{
   assert.equal(await p.locator('.overview-appointment').count(),n);
   const metrics=await p.evaluate(()=>({pageScroll:document.documentElement.scrollWidth,viewport:innerWidth,columns:getComputedStyle(document.querySelector('.metric-grid')).gridTemplateColumns,summary:document.querySelector('.ai-brief').getBoundingClientRect(),agenda:document.querySelector('.overview-stitch-sessions').getBoundingClientRect()}));
   assert.ok(metrics.pageScroll<=metrics.viewport+1,JSON.stringify(metrics));
   assert.ok(metrics.summary.top>=metrics.agenda.bottom-1,JSON.stringify(metrics));
   assert.equal(metrics.columns.trim().split(/\s+/).length,2);
   if(n>=5)assert.equal(await p.locator('.overview-agenda-list').evaluate(el=>el.classList.contains('is-scrollable')&&el.scrollHeight>el.clientHeight),true);
   if(n===12){await p.screenshot({path:resolve(out,'twelve-mobile.png'),fullPage:true});}
  });
 }
}finally{await browser.close();await new Promise(done=>server.close(done));writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
if(report.checks.some(x=>x.status!=='passed'))process.exitCode=1;
