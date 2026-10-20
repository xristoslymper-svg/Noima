import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVisitLayout,orderedVisitBlocks,moveVisitBlock,readCustomSection,customSectionContent,visitLayoutStorageKey} from '../lib/clinical/visit-layout.ts';
import {buildSummaryContext,summaryReadiness,summaryContextKey} from '../lib/clinical/summary-context.ts';
import {simulateVisitWrite} from '../lib/patients/visit-simulation.ts';
import {readFileSync} from 'node:fs';
const key='custom:10000000-0000-4000-8000-000000000001';
test('layout tolerates stale ids, corrupted preferences and duplicate entries without hiding new blocks',()=>{
 const l=normalizeVisitLayout({order:['risk','risk','gone'],collapsed:['risk','risk'],templates:[{id:key,title:' Ύπνος '},{id:key,title:'Duplicate'},{id:'mse',title:'Wrong'}]});
 assert.deepEqual(orderedVisitBlocks(['notes','mse','risk'],l),['risk','notes','mse']);assert.equal(l.templates.length,1);assert.equal(l.templates[0].title,'Ύπνος');
 assert.deepEqual(moveVisitBlock(['notes','mse','risk'],'risk','notes'),['risk','notes','mse']);
 assert.deepEqual(normalizeVisitLayout(null),{order:[],collapsed:[],templates:[]});
 assert.notEqual(visitLayoutStorageKey('doctorA','follow_up'),visitLayoutStorageKey('doctorB','follow_up'));
 assert.notEqual(visitLayoutStorageKey('doctorA','follow_up'),visitLayoutStorageKey('doctorA','initial_assessment'));
});
test('custom narrative preserves title and multiline body exactly',()=>{const body='Γραμμή 1\n\nΓραμμή 2';assert.deepEqual(readCustomSection(customSectionContent('Ύπνος',body)),{title:'Ύπνος',body});});
const fixture=()=>JSON.parse(readFileSync('lib/clinical/treatment-preview.json','utf8'));
test('custom-only visit survives serialization and registration with identical section identity and old encounter unchanged',()=>{
 const b=fixture();const old=JSON.stringify(b.sessions);const id='40000000-0000-4000-8000-000000000009';
 simulateVisitWrite(b,{action:'start_session',patient_id:b.patient.id,request_id:id,session_type:'follow_up'},'2026-10-20T10:00:00Z');
 const result=simulateVisitWrite(b,{action:'save_custom_section',session_id:id,section_key:key,title:'Ύπνος',content:'Αναφέρει βελτίωση του ύπνου με σταθερό ωράριο.',expected_version:null},'2026-10-20T10:01:00Z');
 assert.equal(summaryReadiness({...b,sessions:b.sessions.filter(s=>s.id===id)}),'no_completed_visit');
 const refreshed=JSON.parse(JSON.stringify(b));const session=refreshed.sessions.find(s=>s.id===id);
 simulateVisitWrite(refreshed,{action:'finalize_session',session_id:id,expected_version:session.version},'2026-10-20T10:02:00Z');
 assert.equal(refreshed.sections.find(s=>s.id===result.section.id).session_id,id);
 assert.equal(JSON.stringify(refreshed.sessions.filter(s=>s.id!==id)),old);
 const c=buildSummaryContext(refreshed);assert.ok(c.sources.some(s=>s.section_key===key&&s.label.includes('Ύπνος')));
 assert.equal(summaryReadiness(refreshed),null);
 const before=summaryContextKey(refreshed);refreshed.sections.find(s=>s.section_key===key).content+=' Νέα παρατήρηση.';assert.notEqual(summaryContextKey(refreshed),before);
 assert.throws(()=>simulateVisitWrite(refreshed,{action:'save_custom_section',session_id:id,section_key:key,title:'Ύπνος',content:'Overwrite'},''),/session_unavailable/);
});
test('custom section rejects stale, non-custom keys and invalid titles',()=>{
 const b=fixture();const session=b.sessions.find(s=>s.status==='draft');const write={action:'save_custom_section',session_id:session.id,section_key:key,title:'Στόχοι',content:'Δοκιμή',expected_version:null};
 simulateVisitWrite(b,write,'2026-10-20');assert.throws(()=>simulateVisitWrite(b,write,'2026-10-20'),/stale_section/);
 assert.throws(()=>simulateVisitWrite(b,{...write,section_key:'mse'},''),/invalid_section/);
 assert.throws(()=>simulateVisitWrite(b,{...write,title:'Α\nΒ'},''),/invalid_section/);
});

test('empty custom titles are not clinical evidence or sufficient summary notes',()=>{
 const b=fixture();b.sessions=[{id:'only',status:'completed',started_at:'2026-10-20T10:00:00Z'}];b.sections=[{id:'custom',session_id:'only',section_key:key,content:customSectionContent('Προσωπική ενότητα χωρίς περιεχόμενο','')}];
 assert.ok(!buildSummaryContext(b).sources.some(s=>s.section_key===key));assert.equal(summaryReadiness(b),'insufficient_notes');
});
