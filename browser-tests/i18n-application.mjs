import assert from 'node:assert/strict';
import {resolve} from 'node:path';

export async function switchLanguage(page,locale){
 const old=await page.locator('html').getAttribute('lang');
 const compact=page.locator('dialog[open] button.profile-compact');
 if(await compact.count())await compact.click();
 else await page.getByRole('button',{name:old==='en'?'Profile and settings':'Προφίλ και ρυθμίσεις',exact:true}).click();
 const settings=page.getByRole('dialog',{name:old==='en'?'Settings':'Ρυθμίσεις',exact:true});
 await settings.getByLabel(old==='en'?'Language':'Γλώσσα',{exact:true}).selectOption(locale);
 await page.waitForFunction(locale=>document.documentElement.lang===locale,locale);
 await page.getByRole('dialog',{name:locale==='en'?'Settings':'Ρυθμίσεις',exact:true}).getByRole('button',{name:locale==='en'?'Close':'Κλείσιμο',exact:true}).click();
}

// Hold the actual write at the network boundary. A locale change must preserve
// the SAME editor node and text even while persistence has not completed.
export async function unsavedLocaleSwitch({page,field,text,action,client,patientId,sessionId,size,mode,out}){
 let release,intercepted;const held=new Promise(r=>release=r),started=new Promise(r=>intercepted=r);
 let didHold=false;
 const handler=async route=>{
  const request=route.request();
  if(!didHold&&request.method()==='POST'&&request.postDataJSON()?.action===action){didHold=true;intercepted();await held;}
  await route.continue();
 };
 await page.route('**/api/patients/demo/runtime',handler);
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/patients/demo/runtime')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action===action&&r.ok());
 const url=page.url();
 async function snapshot(){const [session,sections,risks,patient]=await Promise.all([
  client.from('demo_sessions').select('*').eq('id',sessionId).single(),
  client.from('demo_session_sections').select('*').eq('session_id',sessionId).order('id'),
  client.from('demo_risk_assessments').select('*').eq('session_id',sessionId),
  client.from('demo_patients').select('*').eq('id',patientId).single()
 ]);for(const result of [session,sections,risks,patient])assert.equal(result.error,null);return {session:session.data,sections:sections.data,risks:risks.data,patient:patient.data}}
 try{
  await field.fill(text);await field.evaluate(node=>{node.dataset.localeDraft='unchanged'});
  await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error('Draft save was not attempted')),15000))]);
  const before=await snapshot();
  const mseAxis=page.locator('.mse-axis').first();
  if(await mseAxis.count())await mseAxis.evaluate(node=>{node.dataset.localeAxis='unchanged'});
  await page.screenshot({path:resolve(out,`${size}-${mode}-el.png`)});
  await switchLanguage(page,'en');
  assert.equal(page.url(),url);assert.equal(new URL(page.url()).searchParams.get('session'),sessionId);
  const editor=page.locator('[data-locale-draft="unchanged"]');assert.equal(await editor.count(),1);assert.equal(await editor.inputValue(),text);
  if(await mseAxis.count())assert.equal(await page.locator('[data-locale-axis="unchanged"]').count(),1,'The MSE controls must retain the same DOM nodes');
  assert.deepEqual(await snapshot(),before,'Locale must not write clinical records, versions, risk or identity');
  await page.getByRole('button',{name:'Finalize clinical record',exact:true}).waitFor();
  const labels=await page.locator('dialog[open] button,dialog[open] label,dialog[open] h1,dialog[open] h2,dialog[open] h3').allTextContents();
  assert.deepEqual(labels.filter(label=>/[α-ωΑ-Ω]/u.test(label.replaceAll('Ελληνικά','').replaceAll('Ψ',''))),[],'English controls must not contain untranslated Greek');
  assert.doesNotMatch(await page.locator('body').innerText(),/\b(?:clinical|visits|settings|errors|common)\.[a-zA-Z]+\b/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:resolve(out,`${size}-${mode}-en.png`)});
  await switchLanguage(page,'el');assert.equal(await editor.inputValue(),text);assert.deepEqual(await snapshot(),before);
 }finally{release();await saved;await page.unroute('**/api/patients/demo/runtime',handler)}
}

export async function localePersistenceAndRecipient({browser,context,page,origin,api,owner,other,patientId,sessionId,out,size}){
 const headers={origin};
 let response=await context.request.post(origin+'/api/locale',{headers,data:{locale:'en'}});assert.equal(response.status(),200);
 await page.reload();await page.getByRole('button',{name:'Profile and settings',exact:true}).first().waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'en');
 const snapshot=(await owner.client.from('demo_sessions').select('*').eq('id',sessionId).single()).data;
 response=await context.request.post(origin+'/api/pilot',{headers,data:{action:'logout'}});assert.equal(response.status(),200);
 response=await context.request.post(origin+'/api/pilot',{headers,data:{action:'login',email:owner.email,password:owner.password}});assert.equal(response.status(),200);
 await page.reload();await page.getByRole('button',{name:'Profile and settings',exact:true}).first().waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.deepEqual((await owner.client.from('demo_sessions').select('*').eq('id',sessionId).single()).data,snapshot);
 const second=await browser.newContext();await second.request.post(origin+'/api/pilot',{headers,data:{action:'login',email:other.email,password:other.password}});
 assert.equal((await second.request.post(origin+'/api/locale',{headers,data:{locale:'el'}})).status(),200);
 const ownUser=(await owner.client.auth.getUser()).data.user,otherUser=(await other.client.auth.getUser()).data.user;
 assert.equal(ownUser.user_metadata.noima_locale,'en');assert.equal(otherUser.user_metadata.noima_locale,'el');
 assert.equal((await context.request.post(origin+'/api/locale',{headers,data:{locale:'el',user_id:otherUser.id}})).status(),400);
 assert.equal((await context.request.post(origin+'/api/locale',{headers:{origin:'https://untrusted.invalid'},data:{locale:'el'}})).status(),403);
 assert.equal((await context.request.post(origin+'/api/locale',{headers,data:{locale:'de'}})).status(),400);
 await second.close();
 async function post(path,data){const response=await context.request.post(origin+path,{headers,data});const body=await response.json();assert.equal(response.ok(),true,body.error);return body}
 // Complete an additional follow-up entirely in English through the real UI.
 const when=new Date(Date.now()+60*86400000);when.setUTCHours(13,0,0,0);
 const appointment=await post('/api/calendar/command/apply',{action:'create',patient_id:patientId,start_iso:when.toISOString(),end_iso:new Date(+when+3000000).toISOString(),appointment_type:'follow_up'});
 const englishVisit=(await post('/api/calendar/appointment',{event_id:appointment.event.id})).session;
 await post('/api/patients/demo/runtime',{action:'save_section',session_id:englishVisit.id,section_key:'mse',content:'QA English workflow — αρχικό κλινικό κείμενο',source:'manual',expected_version:null});
 await post('/api/patients/demo/runtime',{action:'save_risk',session_id:englishVisit.id,risk:{suicidal_ideation:'negative',intent:'negative',plan:'negative',self_harm:'negative',attempt_history:'negative'},expected_version:null});
 await post('/api/patients/demo/runtime',{action:'save_closure',session_id:englishVisit.id,expected_version:0,value:{transcript:'',clinical_state_summary:'QA unchanged Greek note: Δεν αναφέρει νέα συμπτώματα.',treatment_decision:'QA decision',next_review_focus:'QA review',adherence:'QA adherence',pinned_context:'',source:'manual'}});
 await page.goto(origin+'/patients/demo/'+patientId+'?tab=record&session='+englishVisit.id);
 await page.getByRole('button',{name:'Finalize clinical record',exact:true}).click();
 await page.locator('dialog[open]').getByText('The clinical record was finalized.',{exact:true}).waitFor();
 assert.equal((await owner.client.from('demo_sessions').select('status').eq('id',englishVisit.id).single()).data.status,'completed');
 await page.screenshot({path:resolve(out,`${size}-followup-finalized-en.png`)});
 // A public history form explicitly chooses Greek despite the doctor's English
 // preference. The recipient can switch independently without losing answers.
 response=await context.request.post(origin+'/api/intake',{headers,data:{action:'assign',patient_id:patientId,tools:['history'],channel:'print',recipient_locale:'el'}});
 const assigned=await response.json();assert.equal(response.status(),200,assigned.error);
 const recipient=await browser.newContext({viewport:page.viewportSize()});
 await recipient.route('**/*',r=>[origin,new URL(api).origin].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
 const form=await recipient.newPage();await form.goto(assigned.intakeLink);
 await form.locator('[data-document-locale="el"]').waitFor();await form.getByRole('heading',{name:'Τι σας φέρνει σήμερα;',exact:true}).waitFor();
 await form.getByLabel('Γλώσσα παραλήπτη',{exact:true}).selectOption('en');await form.locator('[data-document-locale="en"]').waitFor();
 assert.equal((await owner.client.auth.getUser()).data.user.user_metadata.noima_locale,'en');
 assert.equal(new URL(form.url()).searchParams.get('lang'),'en');
 const note=form.locator('textarea').first();await note.fill('Απάντηση ασθενούς — preserve original / synthetic');
 await form.getByLabel('Recipient language',{exact:true}).selectOption('el');await form.locator('[data-document-locale="el"]').waitFor();assert.equal(await note.inputValue(),'Απάντηση ασθενούς — preserve original / synthetic');
 await form.screenshot({path:resolve(out,`${size}-recipient-el.png`)});
 await form.getByLabel('Γλώσσα παραλήπτη',{exact:true}).selectOption('en');await form.locator('[data-document-locale="en"]').waitFor();
 await form.screenshot({path:resolve(out,`${size}-recipient-en.png`)});
 await form.reload();await form.locator('[data-document-locale="en"]').waitFor();await form.getByRole('heading').first().waitFor();assert.equal(await note.inputValue(),'Απάντηση ασθενούς — preserve original / synthetic');
 assert.equal(await form.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await recipient.close();
 // Restore the owner's explicit Greek preference for the unchanged baseline suite.
 assert.equal((await context.request.post(origin+'/api/locale',{headers,data:{locale:'el'}})).status(),200);
}
