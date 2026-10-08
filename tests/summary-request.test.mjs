import test from 'node:test';
import assert from 'node:assert/strict';
import {requestClinicalSummary} from '../lib/clinical/summary-request.ts';
const args={patientId:'fictional',tester:'local',hash:'current'};
test('navigation consumes immediate canonical GET fallback without generation',async()=>{
 const calls=[];const fallback={context_hash:'current',mode:'canonical',findings:[{text:'Recorded mood.'}]};
 const result=await requestClinicalSummary(args,async(url,options)=>{calls.push(options);return Response.json(fallback)});
 assert.deepEqual(result,fallback);assert.equal(calls.length,1);assert.equal(calls[0].method,undefined);
});
test('manual refresh uses only POST; stale navigation data cannot trigger live generation',async()=>{
 const methods=[];const request=async(url,options)=>{methods.push(options?.method||'GET');return Response.json({context_hash:options?.method==='POST'?'current':'old',mode:'canonical'})};
 assert.equal((await requestClinicalSummary({...args,force:true},request)).context_hash,'current');assert.deepEqual(methods,['POST']);
 methods.length=0;await assert.rejects(requestClinicalSummary(args,request),/summary_pending/);assert.deepEqual(methods,['GET']);
});
test('failed or aborted generation is an error, never an indefinite preparing response',async()=>{
 await assert.rejects(requestClinicalSummary({...args,force:true},async()=>Response.json({}, {status:503})),/summary_unavailable/);
 const signal=AbortSignal.abort();await assert.rejects(requestClinicalSummary({...args,signal},async(url,options)=>{assert.equal(options.signal,signal);options.signal.throwIfAborted()}));
});
