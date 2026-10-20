import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/google-maps');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/google-maps-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},tsconfigRaw:{compilerOptions:{baseUrl:process.cwd(),paths:{'@/*':['./*']}}}});
const html='<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>';
const server=createServer((req,res)=>{if(['/fixture.js','/fixture.css'].includes(req.url)){res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(resolve(out,req.url.slice(1))));return}res.setHeader('content-type','text/html');res.end(html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;

const browser=await chromium.launch();const report=[];
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const context=await browser.newContext({viewport}),page=await context.newPage(),external=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>{if(!route.request().url().startsWith(origin)){external.push(route.request().url());return route.abort()}return route.continue()});
 await page.goto(origin+'/?view=google');await page.getByRole('heading',{name:'Το ιατρείο σας, πιο εύκολα προσβάσιμο'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Google & Maps',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.getByRole('button',{name:'Σύνδεση Google · σύντομα'}).isDisabled(),true);
 await page.getByRole('button',{name:'Δοκιμή με συνθετικό ιατρείο'}).click();
 await page.getByRole('button',{name:'Δεν δίνω άδεια'}).click();await page.getByRole('status').filter({hasText:'Δεν δόθηκε άδεια'}).waitFor();
 await page.getByRole('button',{name:'Δοκιμή με συνθετικό ιατρείο'}).click();await page.getByRole('button',{name:'Προσομοίωση αποδοχής'}).click();
 await page.getByRole('button',{name:'Ακύρωση δοκιμής'}).click();await page.getByRole('heading',{name:'Πριν από την πραγματική σύνδεση'}).waitFor();
 await page.getByRole('button',{name:'Δοκιμή με συνθετικό ιατρείο'}).click();await page.getByRole('button',{name:'Προσομοίωση αποδοχής'}).click();await page.getByRole('button',{name:'Επιλογή συνθετικού ιατρείου'}).click();
 assert.equal(await page.getByRole('button',{name:'Δοκιμαστική ενημέρωση (0)'}).isDisabled(),true);
 await page.getByRole('checkbox',{name:'Ιστοσελίδα',exact:true}).check();await page.getByRole('button',{name:'Δοκιμαστική ενημέρωση (1)'}).click();await page.getByRole('button',{name:'Πίσω στη σύγκριση'}).click();
 await page.getByRole('button',{name:'Δοκιμαστική ενημέρωση (1)'}).click();await page.getByRole('button',{name:'Επιβεβαίωση δοκιμής'}).click();await page.getByRole('status').filter({hasText:'μόνο στο συνθετικό προφίλ'}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'Ιστοσελίδα',exact:true}).isDisabled(),true);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:resolve(out,viewport.width+'-google-maps.png'),fullPage:true});
 await page.getByRole('button',{name:'Αποσύνδεση δοκιμής'}).click();await page.getByRole('status').filter({hasText:'αποσυνδέθηκε'}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'Πριν από την πραγματική σύνδεση'}).waitFor();
 await page.getByRole('button',{name:'Σελίδα ιατρείου',exact:true}).click();await page.getByRole('textbox',{name:'Ονοματεπώνυμο',exact:true}).waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);report.push({viewport,status:'passed',checks:['explicit opt-in','denial and cancellation','selection','comparison','confirmation','disconnect','refresh reset','existing editor preserved','no external requests']});await context.close();
}}finally{writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));await browser.close();server.close()}
