import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {withSummarySources} from '../lib/clinical/summary-sources.ts';import {buildSummaryContext,summaryContextHash,validateNarrative} from '../lib/clinical/summary-context.ts';
import {completedVisitNotes} from '../lib/clinical/completed-visit-notes.ts';import {latestJourneyNotes} from '../lib/clinical/patient-journey.ts';
const seed=JSON.parse(readFileSync('browser-tests/fixtures/warm-patient.json','utf8')),tester=seed.patient.tester_id;
const prior={id:'70000000-0000-4000-8000-000000000001',patient_id:seed.patient.id,tester_id:tester,version:1,period_label:'Πριν από το NOIMA',content:'Αναδρομική καταγραφή θεράποντος με συνθετικά δεδομένα.',created_at:'2026-10-18T08:00:00Z'};
const report={id:'r',patient_id:seed.patient.id,status:'submitted',tools:['history'],submitted_at:'2026-10-18T09:00:00Z',channel:'email',history_answers:{suicide_attempt:'yes',current_meds:'yes',current_medication_name:'SELF REPORT ONLY'}};
test('supplement sources retain authorship, identity and original records without clinical promotion',async()=>{
 const b=structuredClone(seed),before=JSON.stringify(b),calls=[];
 const enriched=await withSummarySources(b,tester,async(name,args)=>{calls.push({name,args});return name==='demo_prior_course_get'?[prior]:[report]});
 const c=buildSummaryContext(enriched);assert.equal(c.sources.find(s=>s.kind==='prior_course').target,'timeline');assert.ok(c.sources.some(s=>s.kind==='patient_self_report'));
 assert.equal(JSON.stringify(b),before);assert.ok(calls.every(x=>x.args.p_patient===b.patient.id&&x.args.p_tester===tester));
 assert.equal(enriched.medications.length,b.medications.length);assert.equal(enriched.risks.length,b.risks.length);
 const changed=await withSummarySources(b,tester,async name=>name==='demo_prior_course_get'?[{...prior,version:2,content:prior.content+' Διόρθωση.'}]:[report]);
 assert.notEqual(await summaryContextHash(enriched),await summaryContextHash(changed));
});
test('foreign or unavailable supplemental data fails closed',async()=>{
 await assert.rejects(withSummarySources(seed,tester,async name=>name==='demo_prior_course_get'?[]:[{...report,patient_id:'other'}]),/identity/);
 await assert.rejects(withSummarySources(seed,tester,async()=>{throw Error('offline')}),/offline/);
});
test('previous review is corrected, complete and never copied into the current draft',()=>{
 const b=structuredClone(seed),current=b.sessions.find(s=>s.status==='draft'),previous=latestJourneyNotes(b,current).visit;
 const text='QA FULL AGREED REVIEW '+('Πλήρες επόμενο βήμα. '.repeat(30))+' QA END';
 b.corrections.push({id:'c',session_id:previous.id,created_at:'2026-10-18T08:00:00Z',patch:{review:{after:text}}});
 const before=JSON.stringify(b),notes=latestJourneyNotes(b,current).notes;assert.equal(notes.review,text);assert.equal(JSON.stringify(b),before);
 assert.equal(completedVisitNotes(b,current),null);
});
test('unattributed self-report cannot become verified clinical narrative',async()=>{
 const b=await withSummarySources(seed,tester,async name=>name==='demo_prior_course_get'?[]:[report]);
 const c=buildSummaryContext(b);
 assert.throws(()=>validateNarrative({findings:[{text:'Λαμβάνει σίγουρα διαφορετική αγωγή καθημερινά.',source_ids:['patient_report:r'],group_label:'Αγωγή',theme:'medication'}]},c),/invalid_finding/);
});

test('medication revisions keep explicit original visit lineage without guessing or changing state',async()=>{
 const {medicationEventSession}=await import('../lib/clinical/medication-lineage.ts');
 const b=structuredClone(seed),visit=b.sessions[0],med=b.medications[0],event={id:'original',patient_id:b.patient.id,medication_id:med.id,session_id:visit.id};
 const replacement={...event,id:'replacement',session_id:null};
 b.medicationEvents=[event,replacement];b.medicationRevisions=[{event_id:event.id,replacement_id:replacement.id}];
 assert.equal(medicationEventSession(b,replacement),visit.id);
 const next={...event,id:'next',session_id:b.sessions[1].id};b.medicationEvents.push(next);b.medicationRevisions.push({event_id:'next',replacement_id:'replacement'});
 assert.equal(medicationEventSession(b,replacement),undefined);
 assert.equal(medicationEventSession(b,{...replacement,session_id:visit.id}),visit.id);
});
