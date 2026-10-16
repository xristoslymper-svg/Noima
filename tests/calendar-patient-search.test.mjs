import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestedPatients} from '../lib/calendar/patient-search.ts';
const patients=[
{id:'1',first_name:'Ήρα',last_name:'Πείρα'},
{id:'2',first_name:'Τάσος',last_name:'Τσάκου'},
{id:'3',first_name:'Ηρακλής',last_name:'Παπαδόπουλος'},
{id:'4',first_name:'Ελένη',last_name:'Νίκου'},
];
test('suggestions start at two letters and search within existing patients only',()=>{
 assert.deepEqual(suggestedPatients(patients,'ή'),[]);
 assert.deepEqual(suggestedPatients(patients,'ηρ').map(p=>p.id),['1','3']);
 assert.deepEqual(suggestedPatients(patients,'τσ').map(p=>p.id),['2']);
 assert.deepEqual(suggestedPatients(patients,'not-a-patient'),[]);
});
test('search ignores accents, Greek final sigma and word ordering',()=>{
 assert.deepEqual(suggestedPatients(patients,'ηρα πειρα').map(p=>p.id),['1']);
 assert.deepEqual(suggestedPatients(patients,'πειρ ηρ').map(p=>p.id),['1']);
 assert.deepEqual(suggestedPatients(patients,'ΤΑΣΟΣ').map(p=>p.id),['2']);
 assert.deepEqual(suggestedPatients(patients,'  ελ ').map(p=>p.id),['4']);
});
test('suggestions are capped while preserving original patient order',()=>{
 const many=Array.from({length:30},(_,i)=>({id:String(i),first_name:'Μαρία',last_name:'Δοκιμή'}));
 assert.equal(suggestedPatients(many,'μα').length,8);
 assert.deepEqual(suggestedPatients(many,'μα',3).map(p=>p.id),['0','1','2']);
});
