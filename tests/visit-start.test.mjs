import test from 'node:test';
import assert from 'node:assert/strict';
import {visitStartKey,visitStartRequest} from '../lib/clinical/visit-start.ts';
test('lost-response and refresh creation retries retain the same operation and isolate owner and visit intent',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 let count=0;const create=()=>{count++;return '63130000-0000-4000-8000-00000000000'+count};
 const key=visitStartKey('owner','patient','follow_up');
 const first=visitStartRequest(storage,key,create);
 assert.equal(visitStartRequest(storage,key,create),first);
 assert.notEqual(visitStartRequest(storage,visitStartKey('other','patient','follow_up'),create),first);
 assert.notEqual(visitStartRequest(storage,visitStartKey('owner','other','follow_up'),create),first);
 assert.notEqual(visitStartRequest(storage,visitStartKey('owner','patient','follow_up','appointment'),create),first);
 storage.removeItem(key);assert.notEqual(visitStartRequest(storage,key,create),first);
});
