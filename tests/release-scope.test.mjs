import test from 'node:test';import assert from 'node:assert/strict';import {readFile,access} from 'node:fs/promises';import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('tests/release-scope-20261018.json','utf8'));
async function blob(path){const data=await readFile(path);return createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex')}
test('release preserves every unrelated main file byte-for-byte',async()=>{
 const allowed=new Set(manifest.approved);
 await Promise.all(Object.entries(manifest.baseline).filter(([path])=>!allowed.has(path)).map(async([path,sha])=>assert.equal(await blob(path),sha,path)));
});
test('agreed patient and Library source files match the already tested preview exactly',async()=>{
 await Promise.all(Object.entries(manifest.copied).map(async([path,sha])=>assert.equal(await blob(path),sha,path)));
});
test('AMKA guard and its workflow remain outside this release',async()=>{
 for(const path of manifest.excluded)await assert.rejects(()=>access(path),{code:'ENOENT'});
});
