import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegistryLayout,moveRegistryColumn,normalizeRegistryLayout,registryColumns,registryLayoutKey,showRegistryColumn} from '../lib/patients/registry-layout.ts';
test('default registry separates identity/contact and omits narrative clutter',()=>{
 const layout=defaultRegistryLayout();
 assert.deepEqual(layout.order.filter(id=>!layout.hidden.includes(id)),['registry','name','age','phone','diagnosis','last','next']);
 assert.ok(layout.hidden.includes('note'));assert.ok(layout.hidden.includes('complaint'));assert.equal(new Set(layout.order).size,registryColumns.length);
});
test('saved layouts are bounded, deduplicated and migrate missing columns without hiding identity',()=>{
 const normalized=normalizeRegistryLayout({version:1,order:['email','email','unknown','name'],hidden:['name','phone','unknown','phone']});
 assert.deepEqual(normalized.order.slice(0,2),['email','name']);
 assert.equal(normalized.order.length,registryColumns.length);assert.deepEqual(normalized.hidden,['phone']);
 assert.equal(normalized.order.includes('unknown'),false);
 for(const value of [null,[],1,'bad',{version:2},{version:'1'}])assert.deepEqual(normalizeRegistryLayout(value),defaultRegistryLayout());
});
test('drag and arrow movement preserve column identity and every hidden preference without mutation',()=>{
 const layout=showRegistryColumn(defaultRegistryLayout(),'phone',false),snapshot=JSON.stringify(layout);
 let moved=moveRegistryColumn(layout,'next','age');
 assert.equal(moved.order.indexOf('next'),2);assert.deepEqual(moved.hidden,layout.hidden);
 moved=moveRegistryColumn(moved,'next','diagnosis');
 assert.equal(moved.order.indexOf('next'),5);assert.equal(new Set(moved.order).size,registryColumns.length);
 assert.equal(JSON.stringify(layout),snapshot);
 assert.deepEqual(moveRegistryColumn(layout,'name','name'),layout);
 assert.deepEqual(moveRegistryColumn(layout,'unknown','age'),layout);
});
test('name remains visible when all optional columns are hidden and reset produces fresh arrays',()=>{
 let layout=defaultRegistryLayout();
 for(const column of registryColumns)layout=showRegistryColumn(layout,column.id,false);
 assert.deepEqual(layout.order.filter(id=>!layout.hidden.includes(id)),['name']);
 layout=showRegistryColumn(layout,'email',true);assert.equal(layout.hidden.includes('email'),false);
 const first=defaultRegistryLayout();first.order.reverse();
 assert.equal(defaultRegistryLayout().order[0],'registry');
});
test('only layout preferences persist, scoped to owner and browser; no owner means no storage key',()=>{
 assert.notEqual(registryLayoutKey('a'),registryLayoutKey('b'));assert.equal(registryLayoutKey(''),null);
 const serialized=JSON.stringify(normalizeRegistryLayout({version:1,order:['name'],hidden:[],patient:{name:'PRIVATE'},diagnosis:'PRIVATE',phone:'PRIVATE'}));
 assert.equal(serialized.includes('PRIVATE'),false);
 assert.deepEqual(Object.keys(JSON.parse(serialized)),['version','order','hidden']);
});
