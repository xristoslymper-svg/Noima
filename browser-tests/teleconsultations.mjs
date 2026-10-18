import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/teleconsultations');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/teleconsultations-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},tsconfigRaw:{compilerOptions:{baseUrl:process.cwd(),paths:{'@/*':['./*']}}}});
const html='<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>';
const server=createServer((req,res)=>{if(req.url==='/fixture.js'||req.url==='/fixture.css'){res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(resolve(out,req.url.slice(1))));return}res.setHeader('content-type','text/html');res.end(html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();const report=[];
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport});const page=await context.newPage();page.setDefaultTimeout(15000);
  const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const url=route.request().url();if(url.includes('/api/')||!url.startsWith(origin)){requests.push(url);return route.abort()}return route.continue()});
  await page.goto(origin);await page.getByRole('button',{name:'Άνοιγμα επίσκεψης',exact:true}).click();
  const field=page.getByRole('textbox',{name:'Σημειώσεις επίσκεψης',exact:true});
  await field.fill('ΣΥΝΘΕΤΙΚΗ ΚΑΤΑΓΡΑΦΗ — ίδια επίσκεψη');await field.blur();
  await page.getByText('Αποθηκευμένο στο συνθετικό παράδειγμα',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Δοκιμή ροής κλήσης',exact:true}).click();
  await page.getByRole('button',{name:'Προβολή καταγραφής επίσκεψης',exact:true}).click();
  assert.equal(await field.inputValue(),'ΣΥΝΘΕΤΙΚΗ ΚΑΤΑΓΡΑΦΗ — ίδια επίσκεψη');
  await page.getByRole('heading',{name:'Συνθετική κλήση σε εξέλιξη'}).waitFor();
  await page.getByRole('button',{name:'Αποστολή τεστ',exact:true}).click();
  await page.getByRole('button',{name:'Επιβεβαίωση δοκιμής',exact:true}).click();
  await page.getByRole('button',{name:'Αποστολή ιστορικού',exact:true}).click();
  await page.getByRole('button',{name:'Επιβεβαίωση δοκιμής',exact:true}).click();
  await page.getByText('Δοκιμαστικές αναθέσεις στον ίδιο ασθενή:',{exact:false}).waitFor();
  await page.getByRole('heading',{name:'Συνθετική κλήση σε εξέλιξη'}).waitFor();
  await page.getByRole('button',{name:'Τερματισμός κλήσης',exact:true}).click();
  assert.equal(await field.inputValue(),'ΣΥΝΘΕΤΙΚΗ ΚΑΤΑΓΡΑΦΗ — ίδια επίσκεψη');
  await page.getByText('Σενάρια συνθετικής δοκιμής',{exact:true}).click();
  await page.getByRole('checkbox',{name:'Προσομοίωση αποτυχίας αποθήκευσης'}).check();
  await field.fill('ΔΕΝ ΠΡΕΠΕΙ ΝΑ ΧΑΘΕΙ');await field.blur();
  await page.getByText('Συνθετική αποτυχία αποθήκευσης. Το κείμενο παραμένει στο πεδίο.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Πίσω στα ραντεβού',exact:true}).click();
  assert.equal(await field.inputValue(),'ΔΕΝ ΠΡΕΠΕΙ ΝΑ ΧΑΘΕΙ');
  await page.getByRole('checkbox',{name:'Προσομοίωση αποτυχίας αποθήκευσης'}).uncheck();
  await page.getByRole('button',{name:'Αποθήκευση προσχεδίου',exact:true}).click();
  await page.getByText('Αποθηκευμένο στο συνθετικό παράδειγμα',{exact:true}).waitFor();
  await page.screenshot({path:resolve(out,viewport.width+'-workspace.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  report.push({viewport,status:'passed',checks:['same visit note','save failure recovery','call preserved during assignments','no API or external writes','no overflow']});
  await context.close();
 }
}finally{writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));await browser.close();server.close()}
