// Real React components + actual migrated PostgreSQL RPCs behind a synthetic HTTP/auth adapter.
// This does not assert Vercel/Supabase production deployment or real external integrations.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createWorkflowDatabase} from './workflow-postgres.mjs';
const out=resolve('test-results/visit-workflow');mkdirSync(out,{recursive:true});
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import PatientWorkspace from './components/patients/PatientWorkspace';import CalendarPage from './app/calendar/page';import './app/globals.css';import './app/clinical-refinement.css';import './app/visit-workspace.css';import './app/mobile.css';import './app/initial-assessment.css';import './app/clinical-editor.css';import './app/noima-ui.css';const id=location.pathname.split('/').pop();createRoot(document.getElementById('root')).render(location.pathname==='/calendar'?<CalendarPage/>:<PatientWorkspace patientRef={id}/>);`,loader:'jsx',resolveDir:process.cwd()},bundle:true,outfile:resolve(out,'fixture.js'),jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_NOIMA_MOBILE_V2':'"0"'},alias:{'@':process.cwd()},loader:{'.module.css':'local-css'},plugins:[{name:'synthetic-navigation',setup(b){b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'synthetic-navigation'}));b.onLoad({filter:/.*/,namespace:'synthetic-navigation'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/link'?"import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}":"export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:u=>location.assign(u),replace:u=>location.replace(u),refresh:()=>location.reload()});"}));}}]});
const db=await createWorkflowDatabase();
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');res.setHeader('cache-control','no-store');
 if(url.pathname.startsWith('/api/')){
  res.setHeader('content-type','application/json');try{let body=null;if(req.method!=='GET'){let raw='';for await(const c of req)raw+=c;body=JSON.parse(raw||'{}')}const result=await db.dispatch(url.pathname,url.searchParams,body);return res.end(JSON.stringify(result))}catch(e){res.statusCode=409;return res.end(JSON.stringify({error:e.message}))}
 }
 if(['/fixture.js','/fixture.css'].includes(url.pathname)){res.setHeader('content-type',url.pathname.endsWith('.js')?'text/javascript':'text/css');return res.end(readFileSync(resolve(out,url.pathname.slice(1))))}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const [size,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})){
  async function check(name,type,fn){
   const info=await db.seed(type),context=await browser.newContext({viewport});await context.addCookies([{name:'noima-workspace-id',value:db.tester,url:origin}]);await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
   const record=origin+'/patients/demo/'+info.patientId+'?tab=record&session='+info.sessionId;
   async function open(){await page.goto(record);await page.locator('dialog[open]').waitFor();await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).waitFor();assert.deepEqual(errors,[])}
   const administration=()=>page.getByRole('region',{name:'Διεκπεραίωση επίσκεψης',exact:true});
   async function finalize(){await page.getByRole('button',{name:'Οριστικοποίηση καταγραφής',exact:true}).click();await administration().waitFor();await page.locator('dialog[open]').getByText('Η καταγραφή οριστικοποιήθηκε.',{exact:true}).waitFor();const s=(await db.state()).sessions.find(s=>s.id===info.sessionId);assert.equal(s.status,'completed');assert.ok(s.completed_at);}
   try{await fn({page,context,info,open,record,administration,finalize});assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no page horizontal overflow');await page.screenshot({path:resolve(out,size+'-'+name+'.png')});results.push({name,size,status:'passed'});console.log('PASS',size,name)}
   catch(e){await page.screenshot({path:resolve(out,size+'-'+name+'-failed.png')}).catch(()=>{});writeFileSync(resolve(out,size+'-'+name+'-dom.txt'),await page.locator('body').innerText().catch(()=>''));results.push({name,size,status:'failed',error:e.message,errors});console.error('FAIL',size,name,e.message,errors)}
   finally{await context.close();writeFileSync(resolve(out,'report.json'),JSON.stringify({scope:'React/browser and real PostgreSQL repository migrations/RPCs; synthetic HTTP/auth adapter. No remote AI, SMS, email, live database or production patient data.',results},null,2))}
  }
  await check('initial-finalize-payment-next-visit','initial_assessment',async({page,info,open,administration,finalize})=>{
   await open();await finalize();const admin=administration();await admin.getByRole('button',{name:'Πληρωμένο',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Κατάσταση πληρωμής"] button[aria-pressed="true"]')?.textContent==='Πληρωμένο');
   assert.equal((await db.state()).appointments.find(a=>a.id===info.eventId).payment_status,'paid');
   await admin.getByRole('button',{name:'Προγραμματισμός',exact:true}).click();await admin.getByRole('button',{name:'Σε 4 εβδομάδες',exact:true}).click();await admin.getByLabel('Ώρα Αθήνας',{exact:true}).fill(size==='desktop'?'09:00':'11:00');await admin.getByRole('button',{name:'Προγραμματισμός',exact:true}).click();await admin.getByText('Το ραντεβού αποθηκεύτηκε.',{exact:true}).waitFor();
   const saved=await db.state();assert.equal(saved.appointments.length,2);assert.equal(saved.sessions.find(s=>s.id===info.sessionId).status,'completed');assert.equal(db.requests.filter(r=>r.action==='finalize_session').length,1);
   await page.reload();await administration().getByRole('button',{name:'Πληρωμένο',exact:true}).waitFor();assert.equal(await administration().getByRole('button',{name:'Πληρωμένο',exact:true}).getAttribute('aria-pressed'),'true');assert.equal((await db.state()).appointments.length,2);
  });
  await check('compact-followup-finalizes-once','follow_up',async({open,finalize,info})=>{await open();await finalize();assert.equal(db.requests.filter(r=>r.action==='finalize_closure').length,1);assert.equal((await db.state()).sessions.find(s=>s.id===info.sessionId).closure_draft,null)});
  await check('detailed-followup-finalizes-once','follow_up',async({page,open,finalize})=>{await open();await page.getByRole('button',{name:'Αναλυτική καταγραφή',exact:false}).click();await page.getByRole('button',{name:'Σύντομη καταγραφή',exact:true}).waitFor();await finalize();assert.equal(db.requests.filter(r=>r.action==='finalize_closure').length,1)});
  await check('recovery-requires-consent-and-preserves-local','follow_up',async({page,open,info})=>{
   await open();db.faults.save=100;const field=page.getByRole('textbox',{name:'Κλινική εικόνα',exact:true});await field.fill('QA UNSAVED LOCAL TEXT');const load=page.getByRole('button',{name:'Φόρτωση αποθηκευμένου προχείρου…',exact:true});await load.waitFor();await load.click();assert.equal(await field.inputValue(),'QA UNSAVED LOCAL TEXT');await page.getByRole('button',{name:'Ακύρωση φόρτωσης',exact:true}).click();assert.equal(await field.inputValue(),'QA UNSAVED LOCAL TEXT');await load.click();await page.getByRole('button',{name:'Διατήρηση αντιγράφου και φόρτωση',exact:true}).click();
   await page.waitForFunction(id=>document.getElementById(id)?.value==='QA saved state',info.sessionId+'-closure-clinical_state_summary');
   await page.locator('summary').filter({hasText:'Αντίγραφο μη αποθηκευμένων αλλαγών'}).click();assert.match(await page.getByRole('textbox',{name:'Αντίγραφο μη αποθηκευμένων αλλαγών',exact:true}).inputValue(),/QA UNSAVED LOCAL TEXT/);
   assert.equal((await db.state()).sessions.find(s=>s.id===info.sessionId).closure_draft.clinical_state_summary,'QA saved state');
   await page.reload();await page.locator('summary').filter({hasText:'Αντίγραφο μη αποθηκευμένων αλλαγών'}).click();assert.match(await page.getByRole('textbox',{name:'Αντίγραφο μη αποθηκευμένων αλλαγών',exact:true}).inputValue(),/QA UNSAVED LOCAL TEXT/);
  });
  await check('retry-save-does-not-replace-local','follow_up',async({page,open,info})=>{
   await open();db.faults.s…15944 tokens truncated…ctions.some(s=>s.section_key===key&&s.content.trim());
 };
 const requiredVisitStep=(key:string)=>required.has(key)||key==='risk';

 const editor=(key:string,sectionTitle?:string,rows=2)=>{const d=definitions.find(([k])=>k===key)!;if(draft.session_type==='follow_up'&&key in followupFields)return <FollowupField sectionHeading={Boolean(sectionTitle)} field={followupFields[key as keyof typeof followupFields]} title={(sectionTitle||d[1])+(required.has(key)?' *':'')} rows={rows}/>;return <SectionEditor rows={rows} key={draft.id+':'+key} sessionId={draft.id} definition={{key,title:sectionTitle||d[1]}} sectionHeading={Boolean(sectionTitle)} existing={sections.find(s=>s.section_key===key)} proposals={bundle.proposals.filter(p=>p.session_id===draft.id&&p.section_key===key)} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>};
 const assessment=()=> draft.session_type==='initial_assessment'?<StructuredVisitEditor key={draft.id+':assessment'} sessionId={draft.id} kind="assessment" existing={sections.find(s=>s.section_key==='assessment')} followup={false} firstAssessment onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>:<VisitPart anchor="assessment" number={draft.session_type==='follow_up'?'07':'05'} title="Κλινική εκτίμηση *">{narrativeMode.assessment?editor('assessment'):<StructuredVisitEditor key={draft.id+':assessment'} sessionId={draft.id} kind="assessment" existing={sections.find(s=>s.section_key==='assessment')} followup={draft.session_type==='follow_up'} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}<button type="button" className="visit-text-button" onClick={()=>void flushAll(true).then(()=>setNarrativeMode(v=>({...v,assessment:!v.assessment}))).catch(()=>{})}>{narrativeMode.assessment?'Δομημένη αξιολόγηση':'Ελεύθερο κείμενο / έλεγχος υπαγόρευσης αξιολόγησης'}</button></VisitPart>;
 return sharedDraft(<section className="session-workspace runtime-session">
  {draft.session_type==='follow_up'&&<button type="button" onClick={()=>void flushAll(true).then(()=>setDetailed(false)).catch(()=>{})}>Σύντομη καταγραφή</button>}
  <div className="session-work-head">
   <div><h2>{draft.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επανεξέταση'}</h2><p>{fmt(draft.started_at)}</p></div>
   <div className="session-save-overview"><span className={dirtyCount?'pending':''}>{flushing?'Αποθήκευση πρόχειρου…':dirtyCount?dirtyCount+' αλλαγές σε αναμονή':'Το πρόχειρο αποθηκεύτηκε'}</span><small>Έναρξη {fmt(draft.started_at)}</small></div>
  </div>

  {draft.session_type==='follow_up'&&<FollowupField field="transcript" title="Σημειώσεις επίσκεψης" rows={4}/>}
  <nav className="visit-scroll-nav" aria-label="Πλοήγηση επίσκεψης">{visitSteps[draft.session_type==='initial_assessment'?'initial_assessment':'follow_up'].map(([key,label])=>{const isRequired=requiredVisitStep(key),complete=isRequired&&requiredStepState(key);return <button type="button" key={key} aria-current={activePart===key?'step':undefined} className={[activePart===key?'active':'',isRequired?'required':'',complete?'complete':''].filter(Boolean).join(' ')} onClick={()=>goToPart(key)}><i/>{complete&&<Check size={12} aria-hidden="true"/>}<span>{label}{isRequired&&!complete&&<sup aria-label="Υποχρεωτικό">*</sup>}</span></button>})}</nav>
  <fieldset ref={documentRef} disabled={flushing||finalizing||finishingLater} className={draft.session_type==='initial_assessment'?'visit-document first-assessment':'visit-document'}>
   <VisitPart anchor="interview" number="01" title={draft.session_type==='follow_up'?'Συμπτώματα / πορεία':'Λόγος προσέλευσης & παρούσα εικόνα'}>{editor('interview',draft.session_type==='follow_up'?'Συμπτώματα / πορεία':'Λόγος προσέλευσης & παρούσα εικόνα',4)}<details className="visit-related-detail"><summary>Επίδραση στην καθημερινότητα{sections.find(s=>s.section_key==='functioning')?.content.trim()?' · υπάρχει καταγραφή':''}</summary>{editor('functioning','Λειτουργικότητα')}</details>{draft.session_type==='initial_assessment'&&bundle.patient.chief_complaint?.trim()&&<details className="visit-additional"><summary>Λόγος προσέλευσης κατά τη δημιουργία φακέλου</summary><p style={{whiteSpace:'pre-wrap'}}>{bundle.patient.chief_complaint}</p></details>}</VisitPart>
   <VisitPart anchor="mse" number="02" title={draft.session_type==='follow_up'?'MSE · τι άλλαξε':'Εξέταση ψυχικής κατάστασης (MSE)'}>
    {draft.session_type==='follow_up'&&<details className="visit-additional mse-reference"><summary>Προηγούμενο MSE · πλήρης αναφορά</summary>{mseReference?<><small>{fmt(sessionClinicalTime(bundle,mseReference.session))} · ιστορική καταγραφή</small><p style={{whiteSpace:'pre-wrap'}}>{mseReference.section.content}</p>{mseReference.addenda.map(a=><div key={a.id}><strong>{a.kind==='correction'?'Διόρθωση':'Προσθήκη'} · {fmt(a.created_at)}</strong><p>{a.reason}</p><p style={{whiteSpace:'pre-wrap'}}>{a.content}</p></div>)}</>:<p>{contextReady?'Δεν υπάρχει προηγούμενο καταγεγραμμένο MSE.':'Φόρτωση προηγούμενου MSE…'}</p>}<p className="visit-hint">Καταγράψτε μόνο τα σημερινά σχετικά ευρήματα. Η προηγούμενη καταγραφή παραμένει ιστορική.</p></details>}
    {<StructuredVisitEditor key={draft.id+':mse'} sessionId={draft.id} kind="mse" existing={sections.find(s=>s.section_key==='mse')} followup={draft.session_type==='follow_up'} timeline={timeline} baseline={draft.session_type==='follow_up'?mseReference?.section:null} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>}
   </VisitPart>
   <VisitPart anchor="risk" number="03" title="Εκτίμηση κινδύνου"><RiskEditor key={draft.id} sessionId={draft.id} existing={risk} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></VisitPart>
   {draft.session_type==='initial_assessment'&&<VisitPart anchor="history" number="04" title="Ιστορικό">{contextReady?<VisitHistory bundle={bundle} sessionId={draft.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>:<p role="status">Φόρτωση ιστορικού… Μπορείτε να συνεχίσετε την καταγραφή.</p>}</VisitPart>}
   {draft.session_type==='follow_up'&&<VisitPart anchor="psychometrics" number="05" title="Βαθμολογίες έναντι προηγούμενης επίσκεψης">{contextReady?<VisitScores bundle={bundle} sessionId={draft.id} reload={reloadContext}/>:<p role="status">Φόρτωση ψυχομετρικών…</p>}</VisitPart>}
   {draft.session_type==='initial_assessment'&&assessment()}
   <VisitPart anchor="medication" number="06" title={draft.session_type==='initial_assessment'?'Αγωγή':'Αγωγή & ανασκόπηση θεραπείας'}>{contextReady?<><p className="visit-hint">Οι αλλαγές αγωγής ενημερώνουν τον φάκελο μόλις αποθηκευτούν.</p><MedicationTable bundle={bundle} sessionId={draft.id} reload={reloadContext} editablePlan editableEffects firstAssessment={draft.session_type==='initial_assessment'} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>{draft.session_type==='initial_assessment'?<>{['adherence','effects'].filter(key=>sections.find(s=>s.section_key===key)?.content.trim()).map(key=><details key={key} className="visit-additional"><summary>{key==='adherence'?'Προϋπάρχουσα λήψη αγωγής':'Προϋπάρχουσα ανοχή / παρενέργειες'}</summary><p style={{whiteSpace:'pre-wrap'}}>{sections.find(s=>s.section_key===key)?.content}</p></details>)}</>:<div className="visit-related-fields" data-visit-part="adherence">{editor('adherence','Λήψη αγωγής')}{editor('effects','Συνολική ανοχή / παρενέργειες')}</div>}</>:<p role="status">Φόρτωση αγωγής…</p>}</VisitPart>
   {draft.session_type==='follow_up'&&assessment()}
   <VisitPart anchor="plan" number={draft.session_type==='follow_up'?'08':'07'} title={draft.session_type==='initial_assessment'?'Πλάνο & επανεκτίμηση':'Αποφάσεις & επόμενος έλεγχος'}>{draft.session_type==='initial_assessment'?<><SectionEditor key={draft.id+':plan'} sessionId={draft.id} definition={{key:'plan',title:'Πλάνο & επανεκτίμηση'}} placeholder="Θεραπευτικές αποφάσεις, παρεμβάσεις, επόμενα βήματα και τι θα επανεκτιμηθεί..." existing={sections.find(s=>s.section_key==='plan')} proposals={bundle.proposals.filter(p=>p.session_id===draft.id&&p.section_key==='plan')} onSaved={reload} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/>{sections.find(s=>s.section_key==='review')?.content.trim()&&<details className="visit-additional"><summary>Προϋπάρχουσα καταγραφή επανεκτίμησης</summary><p style={{whiteSpace:'pre-wrap'}}>{sections.find(s=>s.section_key==='review')?.content}</p></details>}</>:<div className="visit-related-fields">{editor('plan','Αποφάσεις / παρεμβάσεις')}{editor('review','Τι και πότε θα επανεκτιμηθεί')}</div>}</VisitPart>
   {contextReady&&<VisitPart anchor="appointment" number="09" title="Επόμενο ραντεβού"><VisitNextAppointment bundle={bundle} sessionId={draft.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange} showHeading={false}/></VisitPart>}
   {draft.session_type==='follow_up'&&contextReady&&<details className="visit-additional"><summary>Συμπλήρωση διαχρονικού ιστορικού</summary><VisitHistory bundle={bundle} sessionId={draft.id} reload={reloadContext} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></details>}
  </fieldset>

  <p className="visit-hint">Οι κλινικές σημειώσεις αποθηκεύονται ως πρόχειρο όσο εργάζεστε. Η οριστικοποίηση κλείνει την καταγραφή και εντάσσει τις σημειώσεις στη σύνοψη του φακέλου.</p>
  {draft.session_type==='follow_up'&&<FollowupRecovery disabled={flushing||finalizing||finishingLater}/> }
  <div className="finalize-bar">
   <button onClick={()=>void finalizeSafely()} aria-describedby={showFinalizeGuidance&&blocker?'visit-finalize-guidance':undefined} disabled={finalizing||flushing||finishingLater}><Check size={16}/>{flushing?'Αποθήκευση πρόχειρου…':finalizing?'Οριστικοποίηση…':'Οριστικοποίηση καταγραφής'}</button>{onFinishLater&&<button type="button" className="finalize-later" disabled={finalizing||flushing||finishingLater} onClick={()=>void finishLater()}>{finishingLater?'Αποθήκευση πρόχειρου…':'Συνέχεια αργότερα'}</button>}
   {showFinalizeGuidance&&blocker&&<span id="visit-finalize-guidance" className="visit-finalize-guidance" role="status">{blocker.message} <button type="button" onClick={()=>goToPart(blocker.anchor)}>Μετάβαση</button></span>}
  </div>

  {flushError&&<div className="save-state error" role="alert"><strong>Υπάρχουν μη αποθηκευμένες αλλαγές.</strong> {flushError} <span>Διορθώστε το πρόβλημα ή δοκιμάστε ξανά πριν οριστικοποιήσετε.</span></div>}
  {refreshError&&<div className="save-state" role="status">{refreshError}</div>}
  {finalizeError&&<div className="save-state error" role="alert">{finalizeError}</div>}

  {completed.length>0&&<div className="previous-visits"><span className="kicker">ΠΡΟΗΓΟΥΜΕΝΕΣ</span><CompletedList sessions={completed} onSelect={id=>void flushAll().then(()=>onSelectSession(id)).catch(()=>{})}/></div>}
 </section>);
}

function CompletedList({sessions,onSelect}:{sessions:DemoSession[];onSelect:(id:string)=>void}){
 return <div className="completed-session-list">{sessions.map(session=><button className="completed-session-row" key={session.id} onClick={()=>onSelect(session.id)}><CheckCircle2 size={18}/><div><strong>{session.session_type==='initial_assessment'?'Αρχική αξιολόγηση':'Επαναληπτική συνεδρία'}</strong><span>Οριστικοποιήθηκε {fmt(session.completed_at)}</span></div><span className="open-session-label">Άνοιγμα</span></button>)}</div>;
}

function CompletedSessionView({session,bundle,onBack,reload,registerFlusher,onDirtyChange}:{session:DemoSession;bundle:PatientBundle;onBack:()=>void;reload:()=>Promise<unknown>;registerFlusher:RegisterFlusher;onDirtyChange:DirtyChange}){
 return <>{session.continuity?.approved_at&&<section className="visit-part"><header><h3>Επιβεβαιωμένη κλινική μνήμη</h3></header><p style={{whiteSpace:'pre-wrap'}}>{session.continuity.clinical_state_summary}</p><p><strong>Απόφαση θεραπείας:</strong> {session.continuity.treatment_decision}</p><p><strong>Επόμενος έλεγχος:</strong> {session.continuity.next_review_focus}</p><p><strong>Λήψη αγωγής:</strong> {session.continuity.adherence}</p>{session.continuity.pinned_context&&<p>📌 {session.continuity.pinned_context}</p>}<p className="visit-hint">Επιβεβαιώθηκε {fmt(session.continuity.approved_at)} · {session.continuity.source==='ai_assisted'?'Πρόταση AI ελεγμένη από τον κλινικό':'Χειροκίνητη καταγραφή'}</p><details><summary>Αρχικό κείμενο κλινικού</summary><p style={{whiteSpace:'pre-wrap'}}>{session.continuity.transcript||'Δεν χρησιμοποιήθηκε ξεχωριστή αρχική καταγραφή.'}</p></details></section>}<CompletedRecordEditor key={session.id} session={session} bundle={bundle} reload={reload} onBack={onBack} registerFlusher={registerFlusher} onDirtyChange={onDirtyChange}/></>;
}

function VisitPart({number:_,title,children,anchor}:{number:string;title:string;children:React.ReactNode;anchor?:string}){
 // Single-field interview and structured MSE already own their content surface.
 const ownsSurface=anchor==='interview'||anchor==='mse';
 return <section className="visit-part" data-visit-part={anchor}>
  {anchor!=='interview'&&<header><h3>{title}</h3></header>}
  <div className={ownsSurface?'visit-part-content':'visit-part-surface'}>{children}</div>
 </section>;
}
