import test from 'node:test';
import assert from 'node:assert/strict';
import {readRecovery,writeRecovery,RECOVERY_TTL_MS} from '../lib/clinical/browser-recovery.ts';
function storage(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}}
test('expired clinical drafts are removed without exposing their contents or removing unrelated state',()=>{
 const s=storage();s.setItem('unrelated','keep');writeRecovery(s,'draft','clinical text',1000);
 assert.equal(readRecovery(s,'draft',1001),'clinical text');
 assert.equal(readRecovery(s,'draft',1000+RECOVERY_TTL_MS),null);
 assert.equal(s.getItem('draft'),null);assert.equal(s.getItem('draft:expires'),null);assert.equal(s.getItem('unrelated'),'keep');
});
test('legacy recovery gains bounded expiry, and later edits renew the recovery window',()=>{
 const s=storage();s.setItem('draft','legacy');assert.equal(readRecovery(s,'draft',1000),'legacy');
 assert.equal(s.getItem('draft:expires'),String(1000+RECOVERY_TTL_MS));
 writeRecovery(s,'draft','new edit',2000);assert.equal(readRecovery(s,'draft',1000+RECOVERY_TTL_MS),'new edit');
 assert.equal(readRecovery(s,'draft',2000+RECOVERY_TTL_MS),null);
});
test('invalid or excessively future expiry cannot resurrect clinical recovery',()=>{
 for(const expiry of ['invalid','Infinity',String(RECOVERY_TTL_MS*2)]){
  const s=storage();s.setItem('draft','text');s.setItem('draft:expires',expiry);assert.equal(readRecovery(s,'draft',0),null);
 }
});
