import test from 'node:test';
import assert from 'node:assert/strict';




import {appendAssessmentDictation} from '../lib/clinical/assessment-dictation.ts';
import {initialDocument} from '../lib/clinical/visit-document.ts';

test('reviewed field dictation preserves existing text, diagnostic metadata, other fields and stored keys',()=>{
 const doc=initialDocument('assessment');
 const field=doc.fields.find(f=>f.key==='differential-1');
 field.text='Υπάρχουσα υπόθεση';field.status='provisional';
 field.codes=[{code:'F32.9',label:'Depressive episode',system:'WHO ICD-10',edition:'2019'}];
 const snapshot=structuredClone(doc);
 const reordered={...doc,fields:[...doc.fields].reverse()};
 const result=appendAssessmentDictation(reordered,'differential-1','  Νέα στοιχεία υπέρ και κατά  ');
 assert.deepEqual(result.fields.find(f=>f.key==='differential-1'),{...field,text:'Υπάρχουσα υπόθεση\nΝέα στοιχεία υπέρ και κατά'});
 assert.deepEqual(result.fields.filter(f=>f.key!=='differential-1'),reordered.fields.filter(f=>f.key!=='differential-1'));
 assert.deepEqual(doc,snapshot);
 assert.deepEqual(initialDocument('assessment','',JSON.parse(JSON.stringify(result))),result);
 const impression=appendAssessmentDictation(result,'impression','Κλινικό συμπέρασμα');
 assert.equal(impression.fields.find(f=>f.key==='impression').text,'Κλινικό συμπέρασμα');
 assert.deepEqual(impression.fields.find(f=>f.key==='differential-1'),result.fields.find(f=>f.key==='differential-1'));
});
test('empty/cancelled transcript, removed target and MSE cannot change a document',()=>{
 const doc=initialDocument('assessment');
 assert.equal(appendAssessmentDictation(doc,'impression','  '),doc);
 assert.equal(appendAssessmentDictation(doc,'removed-field','Text'),doc);
 const mse=initialDocument('mse');
 assert.equal(appendAssessmentDictation(mse,'appearance','Text'),mse);
});
