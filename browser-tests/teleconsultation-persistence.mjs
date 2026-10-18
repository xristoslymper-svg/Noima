import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('test-results/teleconsultation-persistence');mkdirSync(out,{recursive:true});
await build({entryPoints:['browser-tests/teleconsultation-persistence-fixture.tsx'],bundle:true,outfile:resolve(out,'fixture.js'),platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},tsconfigRaw:{compilerOptions:{baseUrl:process.cwd(),paths:{'@/*':['./*']}}}});
const source=JSON.parse(readFileSync('lib/clinical/treatment-preview.json','utf8')),pid=source.patient.id,sid='40000000-0000-4000-8000-000000000126';
const blank={transcript:'',clinical_state_summary:'',treatment_decision:'',next_review_focus:'',pinned_context:'',adherence:'',source:'manual'};
function fixture(){return {...structuredClone(source),sessions:[{id:sid,patient_id:pid,tester_id:source.patient.tester_id,session_type:'follow_up',status:'draft',version:0,closure_version:0,closure_draft:{...blank},started_at:'2026-10-18T10:00:00Z',updated_at:'2026-10-18T10:00:00Z',completed_at:null}],sections:[],risks:[],appointments:[],medications:[],medicationEvents:[],medicationSideEffects:[],assessments:[],corrections:[],addenda:[],proposals:[]}}
let db=fixture(),writes=[],failNext=false,failReadAfterCommit=false;
const html='<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>';
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture.invalid');function json(data,status=200){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data))}
 if(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'){res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(resolve(out,url.pathname.slice(1))));return}
 if(url.pathname==='/qa-reset'){db=fixture();writes=[];failNext=false;failReadAfterCommit=false;return json({ok:true})}
 if(url.pathname==='/qa-fail'){failNext=true;return json({ok:true})}
 if(url.pathname==='/qa-state')return json({bundle:db,writes});
 if(url.pathname==='/api/teleconsultations')return json({patients:[db.patient],visits:db.sessions,appointments:[]});
 if(url.pathname==='/api/patients/demo/runtime'){
  if(req.method==='GET'){
   if(url.searchParams.get('patient')!==pid)return json({error:'patient_not_found'},404);
   if(failReadAfterCommit){failReadAfterCommit=false;return json({error:'offline after commit'},503)}
   return json({bundle:db});
  }
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);writes.push(body);
  if(body.session_id!==sid)return json({error:'session_unavailable'},404);
  if(failNext){failNext=false;return json({error:'Αποτυχία αποθήκευσης'},503)}
  const s=db.sessions[0];if(s.status==='completed'&&body.action!=='finalize_closure')return json({error:'session_unavailable'},409);
  if(body.action==='save_closure'){
   if(body.expected_version!==s.closure_version)return json({error:'Η καταγραφή άλλαξε σε άλλη καρτέλα.'},409);
   db.sessions=[{...s,closure_version:s.closure_version+1,closure_draft:body.value}];return json({session:db.sessions[0]});
  }
  if(body.action==='save_document'){
   const old=db.sections.find(r=>r.section_key===body.section_key);
   if(body.expected_version!==(old?.version??null))return json({error:'Η αξιολόγηση άλλαξε.'},409);
   const section={id:'section-mse',session_id:sid,patient_id:pid,section_key:body.section_key,document:body.document,content:body.document.fields.map(f=>f.text).join('\n'),version:(old?.version||0)+1,source:'manual',updated_at:new Date().toISOString()};
   db.sections=[section];db.sessions=[{...s,version:s.version+1}];return json({section});
  }
  if(body.action==='save_risk'){
   const old=db.risks[0];if(body.expected_version!==(old?.version??null))return json({error:'Η αξιολόγηση άλλαξε.'},409);
   const risk={...body.risk,session_id:sid,patient_id:pid,version:(old?.version||0)+1,updated_at:new Date().toISOString()};
   db.risks=[risk];db.sessions=[{...s,version:s.version+1}];return json({risk});
  }
  if(body.action==='finalize_closure'){
   if(!body.confirmed||body.expected_version!==s.version||body.expected_closure_version!==s.closure_version)return json({error:'Η καταγραφή άλλαξε.'},409);
   if(s.status==='completed')return json({session:s});
   db.sessions=[{...s,status:'completed',version:s.version+1,completed_at:new Date().toISOString(),continuity:{...s.closure_draft,session_id:sid,approved_at:new Date().toISOString(),approved_by:s.tester_id},closure_draft:null}];return json({session:db.sessions[0]});
  }
  return json({error:'Unexpected action '+body.action},400);
 }
 if(url.pathname.startsWith('/api/'))return json({error:'Unexpected API '+url.pathname},400);
 res.setHeader('content-type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(),report=[];
async function state(){return (await fetch(origin+'/qa-state')).json()}
async function check(name,viewport,run){
 await fetch(origin+'/qa-reset');const ctx=await browser.newContext({viewport}),page=await ctx.newPage(),errors=[],external=[];
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await ctx.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():(external.push(r.request().url()),r.abort()));
 try{await run(page,ctx);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);report.push({name,status:'passed'})}
 catch(e){report.push({name,status:'failed',error:String(e.stack||e),errors});await page.screenshot({path:resolve(out,'failure-'+report.length+'.png'),fullPage:true})}
 finally{await ctx.close()}
}
const notes=p=>p.getByRole('textbox',{name:'Σημειώσεις επίσκεψης',exact:true});
async function open(p){await p.goto(origin+'/teleconsultations?patient='+pid+'&session='+sid);await p.getByRole('button',{name:'Σημειώσεις',exact:true}).click();await notes(p).waitFor()}
async function saved(p){await p.getByText('Αποθηκευμένο στην επίσκεψη',{exact:true}).waitFor()}
try{
 await check('notes survive refresh and are visible in the existing patient-record editor',{width:1440,height:1000},async(p,ctx)=>{
  await open(p);await notes(p).fill('ΙΔΙΑ ΕΠΙΣΚΕΨΗ — ΜΟΝΙΜΕΣ ΣΗΜΕΙΩΣΕΙΣ');await notes(p).blur();await saved(p);
  assert.equal((await state()).bundle.sessions[0].closure_draft.transcript,'ΙΔΙΑ ΕΠΙΣΚΕΨΗ — ΜΟΝΙΜΕΣ ΣΗΜΕΙΩΣΕΙΣ');
  await p.reload();await p.getByRole('button',{name:'Σημειώσεις',exact:true}).click();assert.equal(await notes(p).inputValue(),'ΙΔΙΑ ΕΠΙΣΚΕΨΗ — ΜΟΝΙΜΕΣ ΣΗΜΕΙΩΣΕΙΣ');
  const folder=await ctx.newPage();await folder.goto(origin+'/folder?patient='+pid+'&session='+sid);await notes(folder).waitFor();assert.equal(await notes(folder).inputValue(),'ΙΔΙΑ ΕΠΙΣΚΕΨΗ — ΜΟΝΙΜΕΣ ΣΗΜΕΙΩΣΕΙΣ');
  assert.ok((await state()).writes.every(w=>w.action==='save_closure'));await folder.close();await p.screenshot({path:resolve(out,'desktop-same-visit.png'),fullPage:true});
 });
 await check('server failure retains text; reload safely retries recovery without another session',{width:390,height:844},async p=>{
  await open(p);await fetch(origin+'/qa-fail');await notes(p).fill('ΚΕΙΜΕΝΟ ΜΕ ΑΠΟΤΥΧΙΑ');await notes(p).blur();await p.getByRole('alert').filter({hasText:'Αποτυχία αποθήκευσης'}).waitFor();
  assert.equal(await notes(p).inputValue(),'ΚΕΙΜΕΝΟ ΜΕ ΑΠΟΤΥΧΙΑ');
  await p.reload();await p.getByRole('button',{name:'Σημειώσεις',exact:true}).click();await saved(p);
  assert.equal(await notes(p).inputValue(),'ΚΕΙΜΕΝΟ ΜΕ ΑΠΟΤΥΧΙΑ');assert.equal((await state()).bundle.sessions.length,1);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:resolve(out,'mobile-recovered.png'),fullPage:true});
 });
 await check('two tabs cannot silently overwrite; comparison keeps local text until explicit resolution',{width:1440,height:1000},async(p,ctx)=>{
  await open(p);const second=await ctx.newPage();second.on('dialog',d=>d.accept());await open(second);
  await notes(second).fill('ΑΠΟΘΗΚΕΥΜΕΝΟ ΑΠΟ ΑΛΛΟ TAB');await notes(second).blur();await saved(second);
  await notes(p).fill('ΔΙΚΟ ΜΟΥ ΠΡΟΣΧΕΔΙΟ');await notes(p).blur();await p.getByRole('alert').filter({hasText:'άλλαξε'}).waitFor();
  assert.equal(await notes(p).inputValue(),'ΔΙΚΟ ΜΟΥ ΠΡΟΣΧΕΔΙΟ');assert.equal((await state()).bundle.sessions[0].closure_draft.transcript,'ΑΠΟΘΗΚΕΥΜΕΝΟ ΑΠΟ ΑΛΛΟ TAB');
  await p.getByRole('button',{name:'Σύγκριση με αποθηκευμένο πρόχειρο',exact:true}).click();
  await p.getByLabel('Σύγκριση προχείρου',{exact:true}).waitFor();assert.equal(await notes(p).inputValue(),'ΔΙΚΟ ΜΟΥ ΠΡΟΣΧΕΔΙΟ');
  await p.getByRole('button',{name:'Διατήρηση του δικού μου και επανάληψη αποθήκευσης',exact:true}).click();await saved(p);
  assert.equal((await state()).bundle.sessions[0].closure_draft.transcript,'ΔΙΚΟ ΜΟΥ ΠΡΟΣΧΕΔΙΟ');await second.close();
 });
 await check('explicit registration closes the same visit; refresh opens read-only canonical record',{width:1440,height:1000},async p=>{
  await open(p);await notes(p).fill('ΤΕΛΙΚΕΣ ΣΗΜΕΙΩΣΕΙΣ');await notes(p).blur();await saved(p);
  await p.locator('summary').filter({hasText:'Σημερινή αξιολόγηση'}).click();
  const mse=p.locator('.visit-structured.mse');await mse.locator('summary').first().click();await mse.getByRole('textbox').first().fill('Σημερινή παρατήρηση');await mse.getByRole('textbox').first().blur();
  await p.locator('.risk-tree-editor').getByRole('button',{name:'Υπάρχει επιθυμία θανάτου ή πρόθεση να πεθάνει; Όχι',exact:true}).click();
  await p.locator('summary').filter({hasText:'Πλάνο & συνέχεια'}).click();
  for(const [name,value] of [['Σημερινή κλινική εικόνα','Εικόνα'],['Λήψη αγωγής','Καταγεγραμμένη λήψη'],['Απόφαση / παρεμβάσεις','Απόφαση'],['Τι θα επανεκτιμηθεί','Επανέλεγχος']]){const field=p.getByRole('textbox',{name,exact:true});await field.fill(value);await field.blur()}
  await p.getByRole('button',{name:'Έλεγχος καταγραφής',exact:true}).click();
  const review=p.getByRole('region',{name:'Έλεγχος πριν την καταχώριση',exact:true});await review.waitFor();
  assert.equal((await state()).bundle.sessions[0].status,'draft');
  await review.getByRole('button',{name:'Καταχώριση επίσκεψης',exact:true}).click();await p.getByRole('heading',{name:'Η επίσκεψη καταχωρίστηκε',exact:true}).waitFor();
  assert.equal((await state()).bundle.sessions[0].continuity.transcript,'ΤΕΛΙΚΕΣ ΣΗΜΕΙΩΣΕΙΣ');assert.equal((await state()).bundle.sessions.length,1);
  await p.reload();await p.getByRole('heading',{name:'Η επίσκεψη καταχωρίστηκε',exact:true}).waitFor();assert.equal(await notes(p).count(),0);
  await p.getByRole('button',{name:'Προβολή στον φάκελο',exact:true}).click();await p.getByText('ΤΕΛΙΚΕΣ ΣΗΜΕΙΩΣΕΙΣ',{exact:true}).waitFor();
 });
}finally{writeFileSync(resolve(out,'report.json'),JSON.stringify({scope:'Actual connected teleconsultation and patient-record editors with isolated HTTP persistence. No live Daily/Supabase/shared database requests.',report},null,2));await browser.close();await new Promise(r=>server.close(r))}
console.log(JSON.stringify(report,null,2));if(report.some(r=>r.status!=='passed'))process.exitCode=1;
