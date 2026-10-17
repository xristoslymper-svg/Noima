import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
assert.equal(process.env.GITHUB_ACTIONS,'true');
// Test-only email login for generated, confirmed users. No committed config,
// cloud Auth settings, production project or migration is modified.
const path='supabase/config.toml',original=readFileSync(path,'utf8');
writeFileSync(path,original.replace(/(\[auth(?:\.email)?\][\s\S]*?)(?=\n\[|$)/g,section=>section.replace(/enable_signup = false/,'enable_signup = true')));
try{
 const result=spawnSync('npx',['supabase','start','--network-id','workflow-ci','-x','studio,imgproxy,realtime,edge-runtime,logflare,vector,supavisor'],{encoding:'utf8',maxBuffer:20*1024*1024});
 // CLI status includes ephemeral credentials. Never send it to CI logs/artifacts.
 if(result.status!==0){const lines=(result.stderr||'').split('\n').filter(s=>/error|failed|invalid/i.test(s)&&!(/key|token|secret|password|bearer|eyJ/i.test(s)));console.error(lines.slice(-8).join('\n'));throw Error('Disposable Supabase startup failed')}
 console.log('Disposable Supabase ready; credentials retained only in runner memory.');
}finally{writeFileSync(path,original)}
