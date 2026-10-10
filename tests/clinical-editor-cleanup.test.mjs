import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialDocument} from '../lib/clinical/visit-document.ts';
import {mseDocumentForSave,confirmMseUnchanged,mseDeltas} from '../lib/clinical/mse-review.ts';
import {finalizationBlocker} from '../lib/clinical/visit-workspace-state.ts';

test('untouched MSE stays empty, never adopts the previous exam or creates normal findings',()=>{
 const original=initialDocument('mse');const saved=mseDocumentForSave(original);
 assert.equal(saved.fields.length,12);assert.ok(saved.fields.every(f=>f.text===''&&f.review==='not_assessed'));
 assert.ok(original.fields.every(f=>f.text===''&&f.review===undefined));
 assert.deepEqual(mseDeltas({...original,fields:original.fields.map(f=>({...f,text:'Previous observation'}))},saved),[]);
 // Empty information still cannot falsely complete a required initial exam.
 const sections=['interview','assessment','plan','review'].map(section_key=>({section_key,content:'Synthetic completed note'}));
 assert.equal(finalizationBlocker([...sections,{section_key:'mse',content:'',document:saved}],{suicidal_ideation:'negative'}).anchor,'mse');
});

test('saving a partial MSE preserves every observation and metadata, and marks only missing fields',()=>{
 const doc=initialDocument('mse');doc.fields[2]={...doc.fields[2],text:'Δεν αναφέρει μεταβολή — υπό διερεύνηση.',review:'changed',reference:{session_id:'synthetic-prior',date:'2026-10-01'}};
 doc.fields.push({key:'legacy',label:'Original narrative',text:'Αυτούσιο παλιό κείμενο'});
 const snapshot=structuredClone(doc),saved=mseDocumentForSave(doc);
 assert.deepEqual(saved.fields[2],snapshot.fields[2]);assert.deepEqual(saved.fields.at(-1),snapshot.fields.at(-1));
 assert.deepEqual(doc,snapshot);assert.deepEqual(mseDocumentForSave(saved),saved);
 const prev=initialDocument('mse');prev.fields[0].text='Παλιότερο εύρημα';
 const sections=['interview','assessment','plan','review'].map(section_key=>({section_key,content:'Synthetic completed note'}));
 assert.equal(finalizationBlocker([...sections,{section_key:'mse',content:saved.fields[2].text,document:saved}],{suicidal_ideation:'negative'},prev),null);
});

test('only explicit reuse confirms prior observations; absent prior domains stay missing',()=>{
 const current=mseDocumentForSave(initialDocument('mse'));current.fields[2]={...current.fields[2],text:'Σημερινό εύρημα',review:'changed'};
 const prev=initialDocument('mse');prev.fields[0].text='Παλιότερη παρατήρηση';prev.fields[2].text='Διαφορετική παλιότερη εικόνα';
 const kept=confirmMseUnchanged(current,prev,true);
 assert.equal(kept.fields[0].text,prev.fields[0].text);assert.equal(kept.fields[0].review,'unchanged');
 assert.equal(kept.fields[2].text,'Σημερινό εύρημα');assert.equal(kept.fields[1].text,'');
 assert.equal(current.fields[0].text,'');
});

test('assessment save is untouched including older formulation keys and provenance',()=>{
 const doc=initialDocument('assessment');doc.fields.find(f=>f.key==='formulation').text='Παλαιότερη διατύπωση';
 assert.equal(mseDocumentForSave(doc),doc);
});

test('provenance is an accessible arrow-only disclosure; guide, skip and alternative MSE editors are absent',()=>{
 const section=readFileSync('components/patients/SectionEditor.tsx','utf8');
 assert.match(section,/<summary aria-label="Προέλευση επιβεβαιωμένου κειμένου" title="Προέλευση επιβεβαιωμένου κειμένου"><span aria-hidden="true">⌄<\/span><\/summary>/);
 assert.match(section,/p\.transcript/);assert.match(section,/p\.approved_text/);
 for(const file of ['components/patients/MseDomain.tsx','components/patients/StructuredVisitEditor.tsx','components/patients/PatientSession.tsx']){
  const source=readFileSync(file,'utf8');
  assert.doesNotMatch(source,/Οδηγός ενότητας|>Δεν αξιολογήθηκε(?: σήμερα)?<|Εναλλακτική καταγραφή MSE/);
 }
 const source=readFileSync('components/patients/StructuredVisitEditor.tsx','utf8');
 assert.doesNotMatch(source,/visibleMseField|onSkip=|Διατύπωση περίπτωσης/);
 assert.match(source,/assessment-legacy-note/);
});
