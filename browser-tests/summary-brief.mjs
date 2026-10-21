import assert from 'node:assert/strict';
import {build} from 'esbuild';import {chromium} from 'playwright';import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
import {buildClinicalCard} from '../lib/clinical/clinical-card.ts';import {buildSummaryContext} from '../lib/clinical/summary-context.ts';
const bundle=JSON.parse(readFileSync('lib/clinical/treatment-preview.json','utf8'));
const context=buildSummaryContext(bundle),base=buildClinicalCard(bundle,context);
const card={...base,diagnoses:[{text:'F41.1 · QA DIAGNOSIS · provisional',source_ids:[]},{text:'Διαφορική: QA DIFFERENTIAL IN FULL',source_ids:[]}],medications:[{text:'QA MEDICATION · 10 mg · daily',source_ids:[]}],alerts:[{key:'risk-note',text:'QA NARRATIVE RISK NOTE IN FULL',source_ids:[],attention:true},{key:'risk',text:'QA STRUCTURED SAFETY SIGNAL',source_ids:[],attention:true}]};
const finding={key:'briefing:0',label:'Πορεία',text:'Αναφέρει σταδιακή βελτίωση με υπολειπόμενες δυσκολίες. Η ιστορική εικόνα δεν αποτελεί σημερινή αξιολόγηση.',source_ids:context.sources.filter(s=>s.kind==='session_section'&&s.section_key==='interview').slice(0,2).map(s=>s.id),attention:false,origin:'synthesis',theme:'course'};
const out=resolve('test-results/summary-brief');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/summary-brief-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'},plugins:[{name:'navigation',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'navigation'}));
 b.onLoad({filter:/.*/,namespace:'navigation'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/link'?"import React from 'react';export default function Link({children,...p}){return <a {...p}>{children}</a>}":"export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:u=>location.assign(u),replace:u=>location.replace(u),refresh:()=>location.reload()});"}));
}}]});

let scenario='ok',cached=false,posts=0,writes=0;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/api/clinical/summary'){
  res.setHeader('content-type','application/json');
  if(req.method==='POST'){
   posts++;await new Promise(r=>setTimeout(r,700));
   if(scenario==='fail')return res.end(JSON.stringify({card,mode:'canonical',reason:'grounding_not_verified',findings:[]}));
   cached=true;return res.end(JSON.stringify({card:{...card,synthesized:true},mode:'synthesis',context_hash:'fixture',findings:[finding],generated_at:'2026-10-21T10:00:00Z'}));
  }
  return res.end(JSON.stringify(cached?{card:{...card,synthesized:true},mode:'synthesis',context_hash:'fixture',findings:[finding],generated_at:'2026-10-21T10:00:00Z'}:{card,mode:'canonical',reason:'summary_pending',context_hash:'fixture',findings:[]}));
 }
 if(url.pathname.startsWith('/api/')){if(req.method!=='GET')writes++;res.setHeader('content-type','application/json');return res.end('{}')}
 if(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'){res.setHeader('content-type',url.pathname.endsWith('css')?'text/css':'text/javascript');return res.end(readFileSync(resolve(out,url.pathname.slice(1))))}
 scenario=url.searchParams.get('scenario')||'ok';
 res.setHeader('content-type','text/html');res.end('<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(),errors=[];
try{
 for(const lang of ['el','en']){
  cached=false;const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  await ctx.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/?lang='+lang);
  const create=page.getByRole('button',{name:lang==='el'?'Δημιουργία σύνοψης':'Create summary',exact:true});
  await create.waitFor();assert.equal(posts,lang==='el'?0:1);
  const header=await create.boundingBox();assert.ok(header.y<300);
  assert.match(await page.locator('[data-summary-facts]').innerText(),/F41.1.*provisional/s);
  await page.getByText('QA MEDICATION · 10 mg · daily',{exact:true}).waitFor();
  assert.equal(await page.getByText('QA STRUCTURED SAFETY SIGNAL',{exact:true}).isVisible(),false);
  await page.locator('[data-summary-alerts]>summary').click();
  assert.equal(await page.getByText('QA STRUCTURED SAFETY SIGNAL',{exact:true}).isVisible(),true);
  assert.equal(await page.getByText('QA NARRATIVE RISK NOTE IN FULL',{exact:true}).isVisible(),true);
  await page.locator('[data-summary-alerts]>summary').click();
  assert.ok(await page.locator('[data-summary-alerts]').evaluate(el=>Boolean(el.previousElementSibling)));
  assert.equal(await page.getByText('Διαφορική: QA DIFFERENTIAL IN FULL',{exact:true}).isVisible(),false);
  await page.locator('[data-summary-differential]>summary').click();
  assert.equal(await page.getByText('Διαφορική: QA DIFFERENTIAL IN FULL',{exact:true}).isVisible(),true);
  await page.locator('[data-summary-differential]>summary').click();
  assert.equal(await page.getByText('QA NARRATIVE RISK NOTE IN FULL',{exact:true}).isVisible(),false);
  assert.ok(await page.locator('[data-summary-review]').innerText());
  const beforePosts=posts;await create.click();
  await page.getByRole('button',{name:lang==='el'?'Δημιουργία…':'Creating…',exact:true}).waitFor();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByRole('button',{name:lang==='el'?'Ενημέρωση σύνοψης':'Update summary',exact:true}).waitFor();
  assert.equal(posts,beforePosts+1,'focus must not abort/restart manual generation');
  await page.getByText(finding.text,{exact:true}).waitFor();
  await page.reload();await page.getByText(finding.text,{exact:true}).waitFor();assert.equal(posts,beforePosts+1);
  await page.screenshot({path:resolve(out,'summary-'+lang+'-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:resolve(out,'summary-'+lang+'-mobile.png'),fullPage:true});
  await ctx.close();
 }
 cached=false;const page=await browser.newPage();await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.goto(origin+'/?scenario=fail');await page.getByRole('button',{name:'Δημιουργία σύνοψης',exact:true}).click();
 await page.getByText('Δεν ολοκληρώθηκε η επιβεβαιωμένη σύνθεση. Εμφανίζονται αποσπάσματα, όχι AI σύνοψη. Μπορείτε να δοκιμάσετε ξανά.',{exact:true}).waitFor();
 assert.equal(await page.getByText(finding.text,{exact:true}).count(),0);
 assert.equal(writes,0);assert.deepEqual(errors,[]);
 writeFileSync(resolve(out,'report.json'),JSON.stringify({posts,writes,externalConnections:false,checks:['visible header action','one manual generation across focus','cached refresh','fallback labelled','diagnosis and review preserved','Greek/English desktop/mobile']},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r))}
