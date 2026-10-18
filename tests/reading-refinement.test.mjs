import test from 'node:test';
import assert from 'node:assert/strict';
import {groupContextSources} from '../lib/clinical/context-presentation.ts';
import {briefPresentation} from '../lib/clinical/brief-presentation.ts';
import {requestClinicalSummary} from '../lib/clinical/summary-request.ts';
test('reading groups identical context without merging source identities or revisions',()=>{
 const a={id:'new',content:' Ίδιο context ',revision:2},b={id:'old',content:'Ίδιο context',revision:0},c={id:'different',content:'Διαφορετικό context',revision:1};
 const input=[a,b,c],before=JSON.stringify(input),groups=groupContextSources(input);
 assert.deepEqual(groups.map(g=>g.map(i=>i.id)),[['new','old'],['different']]);
 assert.equal(groups[0][0],a);assert.equal(groups[0][1],b);assert.equal(JSON.stringify(input),before);
});
test('briefing keeps whole statements and every overflow item accessible',()=>{
 const items=Array.from({length:8},(_,i)=>({text:'Σημείο '+i+'.',source_ids:['source-'+i]}));
 const result=briefPresentation(items);
 assert.equal(result.preview.length,4);
 assert.deepEqual([...result.preview,...result.rest],items);
 const long={text:'Πλήρης πρόταση '.repeat(150)+'.',source_ids:['long']};
 assert.equal(briefPresentation([long]).preview[0].text,long.text.trim());
});
test('passive read-only summary never generates or writes even when cache is missing',async()=>{
 const calls=[];
 await assert.rejects(()=>requestClinicalSummary({patientId:'p',tester:'t',hash:'',readOnly:true,force:true},async(url,init)=>{calls.push({url,method:init?.method||'GET'});return new Response('{}',{status:404})}));
 assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');
});
