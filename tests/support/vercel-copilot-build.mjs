import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {renderEvaluation} from './render-copilot-evaluation.mjs';

// Only the approved Preview branches can run this build-time synthetic evaluation.
// No app runtime gate, auth, database or mail settings are changed.
if(process.env.VERCEL_ENV==='preview' &&
   ['codex/clinical-copilot-agent','codex/copilot-text-masking'].includes(process.env.VERCEL_GIT_COMMIT_REF||'') &&
   process.env.COPILOT_EVAL_APPROVED==='true'){
 const result=spawnSync(process.execPath,['--experimental-strip-types','tests/support/copilot-live-eval.mjs'],{stdio:'inherit',env:process.env,timeout:1200000});
 let report;
 try{report=JSON.parse(await readFile('evaluation/copilot-live.json','utf8'));}
 catch{report={status:'failed',reason:result.error?.code||'evaluation_report_missing',results:[],usage:{calls:0,input_tokens:0,output_tokens:0}};}
 report.process_exit_code=result.status;
 report.commit=process.env.VERCEL_GIT_COMMIT_SHA;
 // A failed evaluation remains prominently visible; it does not masquerade as a passed build check.
 await mkdir('public',{recursive:true});
 await writeFile('public/copilot-evaluation.html',renderEvaluation(report));
 if(process.env.VERCEL_GIT_COMMIT_REF==='codex/copilot-text-masking'&&!report.masking_probe?.passed)throw new Error('hosted_masking_probe_failed');
 console.log('COPILOT_EVALUATION '+JSON.stringify({status:report.status,commit:report.commit,usage:report.usage}));
}
const build=spawnSync('npm',['run','build'],{stdio:'inherit',env:process.env});
process.exitCode=build.status??1;
