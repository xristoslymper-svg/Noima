import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeVisitPart,finalizationBlocker,hasCompletedClinicalHistory,previousMseReference,riskChoices,visitSteps,workspaceHeroAction,workspaceLocation,workspaceTransitionSearch} from '../lib/clinical/visit-workspace-state.ts';
import {initialDocument} from '../lib/clinical/visit-document.ts';

test('completed follow-up history keeps established patients out of initial entry; drafts do not',()=>{
 assert.equal(hasCompletedClinicalHistory({sessions:[]}),false);
 assert.equal(hasCompletedClinicalHistory({sessions:[{status:'draft',session_type:'initial_assessment'}]}),false);
 assert.equal(hasCompletedClinicalHistory({sessions:[{status:'completed',session_type:'follow_up'}]}),true);
 assert.equal(hasCompletedClinicalHistory({sessions:[{status:'completed',session_type:'initial_assessment'}]}),true);
});
test('history destinations distinguish draft, completed, and non-session tabs',()=>{
 const draft=workspaceLocation('?tab=sessions&session=draft');assert.deepEqual(draft,{tab:'sessions',sessionId:'draft'});
 assert.deepEqual(workspaceLocation('?tab=sessions&session=completed'),{tab:'sessions',sessionId:'completed'});
 assert.deepEqual(workspaceLocation('?tab=history&session=draft'),{tab:'history',sessionId:null});
 assert.deepEqual(workspaceLocation(''),{tab:'summary',sessionId:null});
 assert.deepEqual(workspaceLocation('?session=legacy-draft'),{tab:'sessions',sessionId:'legacy-draft'});
 assert.deepEqual(workspaceLocation('?tab=invalid&session=draft'),{tab:'summary',sessionId:null});
});
test('risk represents uncertainty separately; completion matches canonical required fields',()=>{
 assert.deepEqual(riskChoices.map(x=>x[0]),['not_assessed','unknown','negative','positive']);
 assert.equal(new Set(riskChoices.map(x=>x[1])).size,4);
 const sections=['interview','mse','assessment','plan','review'].map(section_key=>({section_key,content:'Recorded'}));
 assert.equal(finalizationBlocker(sections)?.anchor,'risk');
 for(const suicidal_ideation of ['unknown','negative'])assert.equal(finalizationBlocker(sections,{suicidal_ideation}),null);
 const risk={suicidal_ideation:'positive',intent:'not_assessed',plan:'unknown',self_harm:'negative',attempt_history:'positive'};
 assert.equal(finalizationBlocker(sections,risk)?.anchor,'risk');
 assert.equal(finalizationBlocker(sections,{...risk,intent:'unknown'}),null);
 assert.equal(finalizationBlocker(sections.filter(s=>s.section_key!=='review'),{suicidal_ideation:'negative'}).anchor,'plan');
 assert.equal(finalizationBlocker(sections.map(s=>({...s,content:s.section_key==='mse'?' ':s.content})),{suicidal_ideation:'negative'}).anchor,'mse');
});
test('previous MSE includes corrections and never becomes today’s document',()=>{
 const fixture={sessions:[{id:'old',status:'completed',completed_at:'2026-10-01',started_at:'2026-10-01'},{id:'today',status:'draft',started_at:'2026-10-04'},{id:'future',status:'completed',completed_at:'2026-10-05'}],sections:[{id:'mse-old',session_id:'old',section_key:'mse',content:'Prior mood observation'},{session_id:'future',section_key:'mse',content:'Future'}],addenda:[{id:'correction',session_id:'old',kind:'correction',content:'Corrected prior observation'},{id:'other',session_id:'future'}]};
 const original=JSON.stringify(fixture);const reference=previousMseReference(fixture,'today','2026-10-04');
 assert.equal(reference.section.content,'Prior mood observation');assert.deepEqual(reference.addenda.map(a=>a.id),['correction']);
 assert.ok(initialDocument('mse').fields.every(f=>f.text===''));assert.equal(JSON.stringify(fixture),original);
 assert.equal(previousMseReference(null,'today','2026-10-04'),null);
});
test('navigator order covers distinct follow-up adherence and medication; long sections track stably',()=>{
 assert.deepEqual(visitSteps.follow_up.map(x=>x[0]),['interview','adherence','mse','risk','psychometrics','medication','assessment','plan']);
 assert.equal(visitSteps.follow_up.find(x=>x[1]==='Αγωγή')[0],'medication');
 assert.equal(activeVisitPart([{key:'interview',top:-900},{key:'mse',top:400}],125),'interview');
 assert.equal(activeVisitPart([{key:'interview',top:-900},{key:'mse',top:120},{key:'risk',top:900}],125),'mse');
 assert.equal(activeVisitPart([{key:'interview',top:140}],125),'interview');
});


test('non-linear workspace paths keep draft recovery reachable and URL state coherent',()=>{
 assert.equal(workspaceHeroAction(false,true,false),'resume','a new patient with an initial draft must always have a resume action');
 assert.equal(workspaceHeroAction(false,false,true),'resume','an intended appointment is resumable before first completion');
 assert.equal(workspaceHeroAction(false,false,false),'none');
 assert.equal(workspaceHeroAction(true,false,false),'new_follow_up');
 assert.equal(workspaceHeroAction(true,true,false),'resume');

 let search='?appointment=appt-1';
 search=workspaceTransitionSearch(search,'history');
 assert.equal(search,'?appointment=appt-1&tab=history');
 assert.deepEqual(workspaceLocation(search),{tab:'history',sessionId:null});
 search=workspaceTransitionSearch(search,'sessions','draft-1');
 assert.equal(search,'?appointment=appt-1&tab=sessions&session=draft-1');
 assert.deepEqual(workspaceLocation(search),{tab:'sessions',sessionId:'draft-1'});
 search=workspaceTransitionSearch(search,'medications');
 assert.equal(search,'?appointment=appt-1&tab=medications');
 assert.deepEqual(workspaceLocation(search),{tab:'medications',sessionId:null});
 search=workspaceTransitionSearch(search,'sessions','draft-1');
 assert.deepEqual(workspaceLocation(search),{tab:'sessions',sessionId:'draft-1'});
 search=workspaceTransitionSearch(search,'summary');
 assert.equal(search,'?appointment=appt-1');
 assert.deepEqual(workspaceLocation(search),{tab:'summary',sessionId:null});
});
