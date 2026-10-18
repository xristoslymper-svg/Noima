import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {medicationSessionId,treatmentPlan} from '../lib/clinical/treatment-plan.ts';
const seed=JSON.parse(readFileSync('browser-tests/fixtures/warm-patient.json','utf8'));
const fixture=()=>structuredClone(seed);
test('medication association is explicit, patient-scoped, draft-only and never inferred from date/order',()=>{
 const b=fixture(),first=b.sessions[0];
 b.sessions=[{...first,id:'a',status:'draft'},{...first,id:'b',status:'draft'},{...first,id:'done',status:'completed'},{...first,id:'foreign',patient_id:'other',status:'draft'}];
 assert.equal(medicationSessionId(b),null);assert.equal(medicationSessionId(b,''),null);
 assert.equal(medicationSessionId(b,'b'),'b');
 for(const id of ['done','foreign','missing'])assert.throws(()=>medicationSessionId(b,id),/δεν είναι πλέον διαθέσιμη/);
 b.sessions.find(s=>s.id==='b').status='completed';assert.throws(()=>medicationSessionId(b,'b'));
});
test('plan and next review use completed notes, including corrections, never draft text',()=>{
 const b=fixture(),s=b.sessions.find(s=>s.status==='completed');b.sessions=[s,{...s,id:'draft',status:'draft',started_at:'2026-10-18T08:00:00Z'}];
 b.sections=[{id:'p',session_id:s.id,section_key:'plan',content:'Original plan'},{id:'r',session_id:s.id,section_key:'review',content:'Review sleep'},{id:'d',session_id:'draft',section_key:'plan',content:'UNAPPROVED'}];
 b.corrections=[{id:'c',session_id:s.id,created_at:'2026-10-18T08:00:00Z',patch:{plan:{before:'Original plan',after:'Corrected plan'}}}];
 const p=treatmentPlan(b);assert.equal(p.notes.plan,'Corrected plan');assert.equal(p.notes.review,'Review sleep');assert.equal(p.notes.sessionId,s.id);assert.equal(p.notes.corrected,true);
 b.sessions=b.sessions.filter(s=>s.status==='draft');assert.equal(treatmentPlan(b).notes,null);
});
test('measurement comparison excludes invalid/future results and compares the same instrument version',()=>{
 const b=fixture();b.clinical_day='2026-10-18';
 const a={patient_id:b.patient.id,instrument:'PHQ-9',instrument_version:'1',status:'completed',score:10};
 b.assessments=[{...a,id:'current',score:8,completed_at:'2026-10-17T08:00:00Z'},{...a,id:'wrong-version',instrument_version:'2',score:20,completed_at:'2026-10-16T08:00:00Z'},{...a,id:'previous',score:13,completed_at:'2026-10-15T08:00:00Z'},{...a,id:'future',completed_at:'2026-10-19T08:00:00Z'},{...a,id:'foreign',patient_id:'other',completed_at:'2026-10-18T08:00:00Z'}];
 const p=treatmentPlan(b,new Date('2026-10-18T12:00:00Z'));assert.equal(p.scores[0].current.id,'current');assert.equal(p.scores[0].previous.id,'previous');
});
