import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as demographics from '../lib/intake/demographics.ts';

const source=ts.transpileModule(readFileSync('app/api/intake/public/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function route(){
 const calls=[],module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,Response,URL,process:{env:{CLINICAL_DATA_MODE:'synthetic'}},require:id=>id.includes('/demographics')?demographics:id.includes('demo-runtime')?{rpc:async(name,args)=>{calls.push({name,args});return {status:'submitted'}}}:null});
 return {post:module.exports.POST,calls};
}
const request=value=>new Request('https://noima.example/api/intake/public',{method:'POST',headers:{'content-type':'application/json',origin:'https://noima.example'},body:JSON.stringify(value)});
const identity={first_name:'Synthetic',last_name:'Person',age:'0',email:'synthetic@example.invalid'};
for(const value of [null,[],false,12,'text'])test('public intake rejects non-object JSON '+JSON.stringify(value),async()=>{
 const {post,calls}=route();assert.equal((await post(request(value))).status,400);assert.equal(calls.length,0);
});
test('malformed identifying fields are rejected before any RPC',async()=>{
 for(const patch of [{first_name:{}},{last_name:[]},{email:{}},{age:{}},{first_name:'a'.repeat(121)},{amka:'123'},{age:'121'}]){
  const {post,calls}=route();assert.equal((await post(request({action:'submit',token:'a'.repeat(64),identity:{...identity,...patch}}))).status,422);assert.equal(calls.length,0);
 }
});
test('new patient identity preserves zero age and normalizes only supported identifying data',async()=>{
 assert.equal(demographics.normalizeIntakeIdentity({...identity,age:0}).age,'0');
 const {post,calls}=route();assert.equal((await post(request({action:'submit',token:'a'.repeat(64),identity:{...identity,first_name:' Synthetic ',email:'SYNTHETIC@example.invalid'}}))).status,200);
 assert.equal(calls[0].args.p_identity.first_name,'Synthetic');assert.equal(calls[0].args.p_identity.email,'synthetic@example.invalid');assert.equal(calls[0].args.p_identity.age,'0');
});
test('existing-patient submissions keep null identity and original token/RPC',async()=>{
 const {post,calls}=route();assert.equal((await post(request({action:'submit',token:'b'.repeat(64),identity:null,psychometrics:{'GAD-7':[0,0,0,0,0,0,0]}}))).status,200);
 assert.equal(calls[0].name,'demo_intake_submit');assert.equal(calls[0].args.p_identity,null);assert.equal(calls[0].args.p_token,'b'.repeat(64));
});
