import assert from 'node:assert/strict';
import {test} from 'node:test';
import {overviewAttention} from '../lib/overview/attention.ts';
import {createRevalidator} from '../lib/overview/revalidation.ts';
const finding=(key,label='Κίνδυνος')=>({key,label,text:'Complete original evidence. Includes uncertainty.',source_ids:['risk:s'],attention:true,origin:'canonical'});
const risk={suicidal_ideation:'negative',intent:'negative',plan:'negative',self_harm:'negative',attempt_history:'negative',harm_to_others:'negative'};
const card=(content,alerts=[finding('risk')])=>({alerts,sources:[{id:'risk:s',kind:'structured_risk',content}]});
test('incomplete assessment is distinct from positive findings; mixed evidence is never demoted',()=>{
 assert.equal(overviewAttention(card({...risk,suicidal_ideation:'unknown'})).incomplete.length,1);
 const mixed=card({...risk,suicidal_ideation:'positive',plan:'unknown'});
 assert.deepEqual(overviewAttention(mixed).concern,mixed.alerts);
 assert.equal(overviewAttention(card(null,[finding('risk-missing')])).incomplete.length,1);
});
test('historical attempts and previous branches are not presented as current positive findings',()=>{
 assert.equal(overviewAttention(card({...risk,attempt_history:'positive'})).history.length,1);
 const prior={...risk,tree:{version:1,answers:{wish:'negative',selfthoughts:'negative',others:'negative',intent:'positive'},notes:{}}};
 const groups=overviewAttention(card(prior));assert.equal(groups.concern.length,0);assert.equal(groups.history.length,1);
});
test('narratives and missing evidence are not clinically classified; every original alert survives once',()=>{
 const alerts=[finding('risk-note'),finding('narrative-risk:s'),finding('history:allergies','Σημαντικό ιστορικό'),finding('unknown-new-kind')];
 alerts[0].text='Χωρίς νέα ένδειξη κινδύνου';
 const data={alerts,sources:[]},before=JSON.stringify(data),groups=overviewAttention(data);
 assert.equal(groups.review.length,3);assert.equal(groups.history.length,1);
 assert.deepEqual(Object.values(groups).flat().map(f=>f.key).sort(),alerts.map(f=>f.key).sort());
 assert.equal(JSON.stringify(data),before);
 assert.equal(overviewAttention({alerts:[finding('risk')],sources:[]}).review.length,1);
});
test('only explicit structured severe side effects enter documented findings',()=>{
 const f={...finding('effect:e','Παρενέργειες'),source_ids:['effect:e']};
 assert.equal(overviewAttention({alerts:[f],sources:[{id:'effect:e',kind:'structured_side_effect',content:{severity:'severe'}}]}).concern.length,1);
 assert.equal(overviewAttention({alerts:[f],sources:[]}).review.length,1);
});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
test('later focus refresh wins even when an aborted request still resolves',async()=>{
 const requests=[],values=[];
 const sync=createRevalidator({load:signal=>{const d=deferred();requests.push({...d,signal});return d.promise;},apply:v=>values.push(v),error:()=>assert.fail('unexpected error')});
 const first=sync.refresh(),second=sync.refresh();assert.equal(requests[0].signal.aborted,true);
 requests[1].resolve('new');await second;requests[0].resolve('old');await first;
 assert.deepEqual(values,['new']);sync.dispose();
});
test('local mutations invalidate reads and defer focus refresh until all writes finish',async()=>{
 const requests=[],values=[];const sync=createRevalidator({load:()=>{const d=deferred();requests.push(d);return d.promise},apply:v=>values.push(v),error:()=>assert.fail('unexpected error')});
 const old=sync.refresh();sync.beginMutation();sync.beginMutation();await sync.refresh();
 requests[0].resolve('before payment');await old;assert.deepEqual(values,[]);assert.equal(requests.length,1);
 sync.endMutation();assert.equal(requests.length,1);sync.endMutation();assert.equal(requests.length,2);
 requests[1].resolve('after payment');await new Promise(setImmediate);assert.deepEqual(values,['after payment']);sync.dispose();
});
test('failure preserves the last applied snapshot and disposal prevents late updates',async()=>{
 let fail=false,errors=0;const values=[];
 const sync=createRevalidator({load:async()=>{if(fail)throw Error('offline');return 'saved'},apply:v=>values.push(v),error:()=>errors++});
 await sync.refresh();fail=true;await sync.refresh();assert.deepEqual(values,['saved']);assert.equal(errors,1);
 sync.dispose();await sync.refresh();assert.equal(errors,1);
 const d=deferred(),late=createRevalidator({load:()=>d.promise,apply:()=>assert.fail('unmounted update'),error:()=>assert.fail('unmounted error')});
 const pending=late.refresh();late.dispose();d.resolve('late');await pending;
});
