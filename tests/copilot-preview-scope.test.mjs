import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {syntheticChartAt} from '../lib/copilot/chart-scope.ts';
import {syntheticPatient} from '../lib/copilot/preview.ts';
test('only exact built-in chart paths select synthetic data',()=>{
 assert.deepEqual(syntheticChartAt('/patients/demo/treatment-preview'),{key:'treatment',label:'Ira Pira'});
 assert.equal(syntheticChartAt('/patients/demo/synthetic-copilot').key,'copilot');
 for(const path of ['/patients/demo/real-id','/patients/demo/treatment-preview/extra','/patients','/calendar'])assert.equal(syntheticChartAt(path),null);
 const a=syntheticPatient('treatment');a.medications[0].dose=999;
 assert.equal(syntheticPatient('treatment').medications[0].dose,100);
 assert.equal(syntheticPatient('copilot').patient.first_name,'Μαρία');
});
test('synthetic endpoint rejects caller charts and clears conversation from another chart',async()=>{
 const calls=[];
 const compiled=ts.transpileModule(readFileSync('app/api/copilot/synthetic/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};
 const mocks={
 '@/lib/pilot/route':{withPilot:f=>f},
 '@/lib/mail/crypto':{seal:()=> 'sealed',unseal:()=>({chart:'copilot',patient_id:syntheticPatient('treatment').patient.id,question:'SECRET',answer:'SECRET',expires:Date.now()+10000})},
 '@/lib/copilot/preview':{syntheticPreviewEnabled:()=>true,syntheticPatient},
 '@/lib/copilot/fast':{syntheticAnswer:(q,m,s,chart)=>{calls.push({q,m,chart});return [];},answerStream:(_events,meta)=>Response.json(meta)}
 };
 new Function('require','module','exports',compiled)(name=>mocks[name],module,module.exports);
 const post=body=>module.exports.POST(new Request('https://fixture.invalid/api/copilot/synthetic',{method:'POST',body:JSON.stringify(body)}));
 for(const patch of [{chart:'unknown'},{patient_id:'foreign'},{bundle:{patient:{id:'foreign'}}}])assert.equal((await post({query:'Πορεία;',...patch})).status,400);
 assert.equal(calls.length,0);
 const response=await post({query:'Πορεία;',chart:'treatment',conversation:'opaque'});
 assert.equal(response.status,200);assert.equal((await response.json()).patient.first_name,'Ira');
 assert.deepEqual(calls,[{q:'Πορεία;',m:null,chart:'treatment'}]);
});
