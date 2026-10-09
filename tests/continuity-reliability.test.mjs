import {test} from 'node:test';
import assert from 'node:assert/strict';
import {riskFindings,riskFindingLabel,riskHasConcern} from '../lib/clinical/risk-findings.ts';
import {assessmentLink,assessmentLinkLabel} from '../lib/clinical/assessment-link.ts';
import {continuityContexts} from '../lib/clinical/continuity-context.ts';
const base={suicidal_ideation:'negative',intent:'not_assessed',plan:'not_assessed',self_harm:'not_assessed',attempt_history:'not_assessed',harm_to_others:'not_assessed',tree:{version:1,answers:{wish:'negative',selfthoughts:'negative'},notes:{}}};
test('negative NSSI answer remains distinct from unassessed acts and attempt history',()=>{
 const before=structuredClone(base);const f=riskFindings(base);assert.equal(f.find(f=>f.key==='tree:selfthoughts').value,'negative');assert.equal(f.find(f=>f.key==='attempt_history').value,'not_assessed');assert.equal(f.some(f=>f.key==='self_harm'),false);assert.equal(riskHasConcern(base),false);assert.deepEqual(base,before);
});
test('missing, unknown, not assessed and negative remain distinct; no inference from previous branch',()=>{
 const f=riskFindings({...base,tree:{...base.tree,answers:{wish:'negative',selfthoughts:'unknown',plan:'positive'},notes:{}}});assert.equal(riskFindingLabel(f.find(f=>f.key==='tree:selfthoughts')),'Άγνωστο');assert.equal(f.find(f=>f.key==='tree:plan').previousBranch,true);assert.equal(riskHasConcern({...base,tree:{...base.tree,answers:{wish:'negative',plan:'positive'},notes:{}}}),false);
 assert.equal(riskFindingLabel({key:'tree:selfthoughts',value:'unavailable'}),'Μη διαθέσιμη απάντηση');assert.equal(riskFindingLabel({key:'legacy',value:'not_assessed'}),'Δεν διερευνήθηκε');assert.equal(riskFindings(null).length,0);
});
test('actual behavior and older general positive findings are never hidden by a negative thoughts response',()=>{
 const risk={...base,self_harm:'positive',tree:{...base.tree,answers:{wish:'negative',selfthoughts:'positive',selfacted:'positive'},notes:{selfacted:'Σημερινή πράξη'}}};assert.equal(riskHasConcern(risk),true);assert.equal(riskFindings(risk).find(f=>f.key==='tree:selfacted').note,'Σημερινή πράξη');assert.equal(riskFindings(risk).find(f=>f.key==='self_harm'),undefined);assert.equal(riskFindings({...risk,tree:{...risk.tree,answers:{wish:'negative',selfthoughts:'negative'}}}).find(f=>f.key==='self_harm').value,'positive');
});
test('one interpretation distinguishes direct, appointment-derived, pending, unavailable and unlinked associations',()=>{
 const b={sessions:[{id:'visit',patient_id:'p',started_at:'2026-10-01'}],appointments:[{id:'appt',session_id:'visit'},{id:'pending',session_id:null}]};const a={patient_id:'p',session_id:null,appointment_id:'appt'};
 assert.equal(assessmentLink(b,a).kind,'appointment');assert.equal(assessmentLink(b,a).session.id,'visit');assert.match(assessmentLinkLabel(b,a),/Μέσω ραντεβού/);
 assert.equal(assessmentLink(b,{...a,session_id:'visit'}).kind,'direct');assert.equal(assessmentLink(b,{...a,appointment_id:'pending'}).session,undefined);
 assert.equal(assessmentLink(b,{...a,session_id:'missing'}).kind,'unavailable');assert.equal(assessmentLink(b,{...a,patient_id:'other'}).session,undefined);assert.equal(assessmentLink(b,{...a,appointment_id:null}).kind,'unlinked');
});
test('approved context survives empty subsequent visits; revisions preserve the original source and history',()=>{
 const original={approved_at:'2026-10-01T09:00:00Z',approved_by:'doctor',pinned_context:'Εργασιακή παρουσίαση'};const b={patient:{id:'p'},sessions:[{id:'v1',patient_id:'p',started_at:'2026-10-01',status:'completed',continuity:original},{id:'v2',patient_id:'p',started_at:'2026-10-02',status:'completed',continuity:{...original,pinned_context:''}},{id:'v3',patient_id:'p',status:'draft',continuity:original}],contextRevisions:[]};
 const first=continuityContexts(b);assert.equal(first.length,1);assert.equal(first[0].status,'active');assert.equal(first[0].sourceSessionId,'v1');
 b.contextRevisions=[{id:'r1',patient_id:'p',source_session_id:'v1',revision:1,action:'updated',content:'Μετατέθηκε',created_at:'2026-10-03'}];assert.equal(continuityContexts(b)[0].content,'Μετατέθηκε');
 b.contextRevisions.push({id:'r2',patient_id:'p',source_session_id:'v1',revision:2,action:'resolved',content:'Μετατέθηκε',created_at:'2026-10-04'});const item=continuityContexts(b)[0];assert.equal(item.status,'resolved');assert.equal(item.history.length,2);assert.equal(item.original,'Εργασιακή παρουσίαση');assert.equal(original.pinned_context,'Εργασιακή παρουσίαση');
});
