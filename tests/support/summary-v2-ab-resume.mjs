// Second and FINAL phase. First report consumed exactly 3 provider attempts; this runs up to three more.
// Never rerun A or retry incomplete B baseline. Total budget across both builds: six attempts.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {makePatients} from './longitudinal-fixtures.mjs';
import {buildSummaryContext} from '../../lib/clinical/summary-context.ts';
import {providerEvidence} from '../../lib/clinical/provider-evidence.ts';
const branch='audit/summary-v2-ab-20261016';
const firstUrl='https://noima-blor4j8a1-xristoslymper-3481.vercel.app/summary-v2-ab.json';
await mkdir('public',{recursive:true});
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const save=async(report)=>{
 await writeFile('public/summary-v2-ab.json',JSON.stringify(report,null,2));
 await writeFile('public/summary-v2-ab.html','<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NOIMA Summary A/B</title><style>body{max-width:1080px;margin:45px auto;padding:0 24px;font:16px/1.6 system-ui;color:#273b32}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}section{padding:18px;border:1px solid #ccd8d1;border-radius:12px}li{margin:10px 0}small{color:#576c60}@media(max-width:780px){main{display:block}section{margin-bottom:18px}}</style></head><body><h1>NOIMA — Clinical Summary A/B</h1><p>Ίδιο μοντέλο και ιστορικό, 12 συνεδρίες × 3 συνθετικοί ασθενείς. Καμία νέα κλήση ελέγχου/κριτή. Δεν αποτελούν κλινικά εγκεκριμένες συνόψεις.</p><p>Κατάσταση: <b>'+escape(report.status)+'</b> · Κλήσεις συνολικά: '+report.provider_calls_attempted+' / 6 · Μοντέλο: '+escape(report.model)+'</p>'+['A','B','C'].map(id=>'<h2>Ασθενής '+id+'</h2><main>'+['baseline','v2'].map(arm=>{const r=report.results?.find(x=>x.patient===id&&x.arm===arm);return '<section><h3>'+escape(arm==='baseline'?'Υφιστάμενο prompt':'Νέο ελληνικό prompt')+'</h3><small>'+escape(r?.status||'pending')+'</small>'+(r?.findings?'<ol>'+r.findings.map(f=>'<li><b>'+escape(f.group_label)+'</b> '+escape(f.text)+' <small>('+escape(f.source_ids?.length||0)+' πηγές)</small></li>').join('')+'</ol>':'<p>'+escape(r?.error||'Δεν εκτελέστηκε')+'</p>')+'</section>'}).join('')+'</main>').join('')+'<p><a href="/summary-v2-ab.json">Πλήρη αποτελέσματα JSON</a></p></body></html>');
};
let report={status:'not_run',provider_calls_attempted:0,results:[],limit:6};
const allowed=process.env.VERCEL_ENV==='preview' && process.env.VERCEL_GIT_COMMIT_REF===branch;
if(!allowed){report.reason='Not approved isolated Preview';await save(report);process.exit(0);}
try{
 const response=await fetch(firstUrl,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Prior report HTTP '+response.status);
 report=await response.json();
 if(report.provider_calls_attempted!==3||report.results?.length!==3||report.results[2]?.patient!=='B'||report.results[2]?.arm!=='baseline')throw Error('Unexpected prior run ledger; refusing new calls');
 if(report.results[2].status!=='failed_no_retry')throw Error('Prior B baseline not marked incomplete; refusing new calls');
 report.original_deployment=firstUrl;report.resume=true;report.limit=6;report.status='resuming';
}catch(error){report={status:'prior_report_unavailable_no_calls',reason:String(error.message||error),provider_calls_attempted:0,limit:6,results:[]};await save(report);process.exit(0);}
const model=process.env.OPENAI_CLINICAL_MODEL||'gpt-6-luna';
if(!process.env.OPENAI_API_KEY||model!==report.model){report.status='provider_configuration_changed_no_calls';await save(report);process.exit(0);}
const oldPrompt=await readFile('app/api/clinical/summary/route.ts','utf8');
const original=oldPrompt.match(/const CLINICAL_WRITING_PROMPT=`([\s\S]*?)`;/)?.[1];
const priorRunner=await readFile('tests/support/summary-v2-ab.mjs','utf8');
const variant=priorRunner.match(/const v2=`([\s\S]*?)`;/)?.[1];
if(!original||!variant){report.status='prompt_extraction_failed_no_calls';await save(report);process.exit(0);}
const themes=['general','medication','course','risk','psychometrics','plan','context'];
const schemaFor=ids=>({type:'object',properties:{findings:{type:'array',minItems:1,maxItems:8,items:{type:'object',properties:{text:{type:'string',minLength:12},source_ids:{type:'array',minItems:1,maxItems:12,items:{type:'string',enum:ids}},group_label:{type:'string',minLength:2,maxLength:32},theme:{type:'string',enum:themes}},required:['text','source_ids','group_label','theme'],additionalProperties:false}}},required:['findings'],additionalProperties:false});
const cases=makePatients(12);
const endpoint=(process.env.OPENAI_BASE_URL||'https://api.openai.com/v1')+'/responses';
for(const [idx,arm] of [[1,'v2'],[2,'baseline'],[2,'v2']]){
 if(report.provider_calls_attempted>=6)break;
 const c=buildSummaryContext(cases[idx],'2026-10-16');
 const input=JSON.stringify(providerEvidence({as_of:c.day,sources:c.sources,corrections:c.layers.corrections}));
 const item={patient:['A','B','C'][idx],arm,status:'pending',input_characters:input.length,source_count:c.sources.length};
 report.results.push(item);await save(report);
 report.provider_calls_attempted++;await save(report);
 const started=Date.now();
 try{
  const response=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(65000),headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions:arm==='baseline'?original:variant,input,max_output_tokens:3400,text:{format:{type:'json_schema',name:'clinical_evidence',strict:true,schema:schemaFor(c.sources.map(s=>s.id))}}})});
  item.http_status=response.status;
  if(!response.ok){item.status='provider_error';item.error='HTTP '+response.status;await save(report);break;}
  const body=await response.json();item.usage=body.usage||null;item.elapsed_ms=Date.now()-started;
  const raw=body.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
  if(body.status!=='completed'||!raw)throw Error('Provider returned no completed JSON');
  const parsed=JSON.parse(raw);
  if(!Array.isArray(parsed.findings))throw Error('Invalid findings output');
  item.findings=parsed.findings;item.status='completed';
 }catch(error){item.status='failed_no_retry';item.error=String(error.message||error).slice(0,200);}
 await save(report);
}
report.status=report.provider_calls_attempted===6?'six_attempt_budget_spent':'partial_or_unavailable';
await save(report);
console.log('SUMMARY_V2_AB_FINAL',JSON.stringify({calls:report.provider_calls_attempted,status:report.status,results:report.results.map(x=>({patient:x.patient,arm:x.arm,status:x.status,error:x.error||null}))}));
