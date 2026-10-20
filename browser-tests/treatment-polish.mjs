import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/treatment-polish');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/treatment-polish-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'},plugins:[{name:'navigation',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'navigation'}));
 b.onLoad({filter:/.*/,namespace:'navigation'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/link'?"import React from 'react';export default function Link({children,...p}){return <a {...p}>{children}</a>}":"export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:u=>location.assign(u),replace:u=>location.replace(u),refresh:()=>location.reload()});"}));
}}]});
const calls=[];
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname.startsWith('/api/')){
  let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):null;calls.push({path:url.pathname,body});
  res.setHeader('content-type','application/json');
  if(url.pathname==='/api/intake'&&body?.action==='devices')return res.end(JSON.stringify({devices:[]}));
  if(url.pathname==='/api/intake'&&body?.action==='assign')return res.end(JSON.stringify({intake:{id:'qa-intake'},intakeToken:'synthetic-fixture-only'}));
  if(url.pathname==='/api/intake/email')return res.end('{}');
  res.statusCode=403;return res.end(JSON.stringify({error:'Unexpected API blocked by isolated fixture'}));
 }
 if(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'){res.setHeader('content-type',url.pathname.endsWith('css')?'text/css':'text/javascript');return res.end(readFileSync(resolve(out,url.pathname.slice(1))))}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="'+(url.searchParams.get('lang')==='en'?'en':'el')+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(),report=[];
try{
 for(const lang of ['el','en'])for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const messages=JSON.parse(readFileSync('i18n/messages/'+lang+'.json','utf8')),t=key=>key.split('.').reduce((v,k)=>v[k],messages);
  await page.goto(origin+'/?lang='+lang);await page.locator('[data-plan-box]').first().waitFor();
  assert.equal(await page.locator('[data-plan-box]').count(),2);
  const boxes=await page.locator('[data-plan-box]').evaluateAll(nodes=>nodes.map(n=>{const p=n.querySelector('p'),s=getComputedStyle(p),r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,length:p.textContent.length,overflow:s.overflow,clamp:s.webkitLineClamp,full:p.scrollHeight<=p.clientHeight+1}}));
  assert.ok(boxes.every(b=>b.length>500&&b.full&&b.overflow!=='hidden'&&b.clamp==='none'));
  assert.ok(width===390?boxes[1].y>boxes[0].y:Math.abs(boxes[1].y-boxes[0].y)<2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('[data-plan-source] button').click();
  assert.equal(await page.getByTestId('source-visit').innerText(),'20000000-0000-4000-8000-000000000002');
  await page.screenshot({path:resolve(out,'treatment-'+lang+'-'+width+'.png'),fullPage:true});
  await page.getByRole('button',{name:'Open assignment',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  const geometry=await dialog.evaluate(d=>{
   const language=d.querySelector('.assignment-language').getBoundingClientRect(),intro=d.querySelector('.assignment-intro').getBoundingClientRect(),title=d.querySelector('h2'),s=getComputedStyle(title);
   return {languageBottom:language.bottom,introTop:intro.top,font:s.fontFamily,titleSize:parseFloat(s.fontSize),fits:d.scrollWidth<=d.clientWidth+1};
  });
  assert.ok(geometry.introTop>=geometry.languageBottom);assert.ok(geometry.fits);assert.match(geometry.font,/Inter/);assert.ok(geometry.titleSize<=24);
  const recipient=dialog.locator('.assignment-language select');assert.equal(await recipient.inputValue(),'el');
  await recipient.selectOption('en');
  await dialog.getByRole('checkbox',{name:'PHQ-9',exact:true}).check();
  await dialog.getByRole('button',{name:/Tablet/}).click();assert.equal(await recipient.isDisabled(),true);
  await dialog.getByRole('button',{name:'Email',exact:true}).click();assert.equal(await recipient.inputValue(),'en');assert.equal(await recipient.isEnabled(),true);
  await dialog.screenshot({path:resolve(out,'assignment-'+lang+'-'+width+'.png')});
  await dialog.getByRole('button',{name:t('notifications.sendEmail'),exact:true}).click();
  await dialog.locator('.intake-launcher-success').waitFor();
  const assignment=calls.filter(c=>c.body?.action==='assign').at(-1),mail=calls.filter(c=>c.path==='/api/intake/email').at(-1);
  assert.equal(assignment.body.patient_id,'10000000-0000-4000-8000-000000000006');assert.equal(assignment.body.channel,'email');assert.equal(assignment.body.recipient_locale,'en');assert.deepEqual(assignment.body.tools,['history','PHQ-9']);assert.equal(mail.body.to,'synthetic@example.invalid');
  assert.deepEqual(errors,[]);report.push({lang,width,longTextVisible:true,sourceVisitUnchanged:true,languageIntroDoNotOverlap:true,syntheticDeliveryPayloadUnchanged:true});
  await context.close();
 }
 writeFileSync(resolve(out,'report.json'),JSON.stringify({report,network:'isolated fixture only; no database/email/provider access'},null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r))}
