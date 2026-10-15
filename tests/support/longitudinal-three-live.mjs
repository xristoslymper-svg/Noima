// One authorized, synthetic-only Preview audit. Not an app endpoint or production change.
import {mkdir,writeFile,open} from 'node:fs/promises';
import {makePatients,truth,questions} from './longitudinal-fixtures.mjs';
import {fastAnswer} from '../../lib/copilot/fast.ts';
const report={source_commit:'27e61cefd3a7bb568a73a02a4e08ebf70a9a762a',test_commit:process.env.VERCEL_GIT_COMMIT_SHA||null,at:new Date().toISOString(),synthetic_only:true,production_writes:0,summary_provider_calls:0,assistant_provider_calls:0,model:process.env.OPENAI_COPILOT_FAST_MODEL||null,results:[],truth,status:'not_run',scope:'Same fastAnswer implementation with 3 new synthetic 12-visit charts; no app auth, patient DB or browser latency tested.'};
await mkdir('public',{recursive:true});
const authorized=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='audit/longitudinal-three-calls-20261016'&&Date.now()<Date.parse('2026-10-16T02:00:00Z');
if(authorized&&report.model&&process.env.OPENAI_API_KEY){
 const lock=await open('.longitudinal-three-call-lock','wx');await lock.close();
 Object.assign(process.env,{CLINICAL_DATA_MODE:'synthetic',COPILOT_SYNTHETIC_APPROVED:'true',EXTERNAL_AI_ENABLED:'true'});
 const realFetch=globalThis.fetch,endpoint=(process.env.OPENAI_BASE_URL||'https://api.openai.com/v1')+'/responses';
 globalThis.fetch=async(url,init)=>{
  if(String(url)!==endpoint||init?.method!=='POST')throw new Error('non_provider_network_forbidden');
  if(report.assistant_provider_calls>=3)throw new Error('three_call_limit');
  const body=JSON.parse(init.body);
  if(body.model!==report.model||body.max_output_tokens!==1000||body.stream!==true||body.store!==false)throw new Error('unexpected_provider_contract');
  if(String(body.input).includes('DRAFT_EXCLUDE_CANARY'))throw new Error('draft_leak_blocked');
  report.assistant_provider_calls++;
  const row=report.results.at(-1);row.input_characters=String(body.input).length;
  await writeFile('public/audit-call-ledger.json',JSON.stringify({calls:report.assistant_provider_calls,model:report.model}));
  return realFetch(url,init);
 };
 const patients=makePatients(12);
 await writeFile('public/longitudinal-fixtures.json',JSON.stringify({truth,questions,patients},null,2));
 for(let p=0;p<3;p++){
  const row={patient:truth[p].id,question:questions[p],answer:null,status:'started'};report.results.push(row);
  try{let done=null;for await(const e of fastAnswer(patients[p],questions[p],null))if(e.type==='done')done=e;if(!done)throw new Error('no_complete_answer');Object.assign(row,{answer:done.answer,status:'completed_ungraded',usage:done.usage,first_text_ms:done.first_text_ms,elapsed_ms:done.elapsed_ms,snapshot:done.snapshot});}
  catch(e){Object.assign(row,{status:'failed_no_retry',error:e.message});}
  await writeFile('public/longitudinal-live.json',JSON.stringify(report,null,2));
 }
 globalThis.fetch=realFetch;report.status=report.results.every(r=>r.status==='completed_ungraded')?'completed_pending_manual_review':'partial';
}else report.reason=authorized?'Fast model or key not available; no calls made.':'Not the authorized Preview or authorization expired; no calls made.';
await writeFile('public/longitudinal-live.json',JSON.stringify(report,null,2));
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await writeFile('public/index.html','<!doctype html><html lang="el"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>NOIMA Synthetic Audit</title><style>body{font:18px/1.7 system-ui;max-width:900px;margin:50px auto;padding:20px}blockquote{border-left:3px solid;padding-left:20px}</style><h1>NOIMA · Longitudinal synthetic audit</h1><p>'+esc(report.status)+' · '+report.assistant_provider_calls+' / 3 provider calls. No patient database or new AI summaries.</p>'+report.results.map(r=>'<h2>Patient '+r.patient+'</h2><p>'+esc(r.question)+'</p><blockquote>'+esc(r.answer||r.error||r.status)+'</blockquote>').join('')+'<p><a href="/longitudinal-live.json">Raw results</a></p></html>');
console.log(JSON.stringify({status:report.status,calls:report.assistant_provider_calls,model:report.model,results:report.results.map(({patient,status,usage,first_text_ms,elapsed_ms,error})=>({patient,status,usage,first_text_ms,elapsed_ms,error}))}));
