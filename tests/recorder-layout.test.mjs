import test from 'node:test';
import assert from 'node:assert/strict';
import {recorderDockPosition} from '../lib/clinical/recorder-layout.ts';
const desktop={layoutHeight:900,viewport:{left:0,top:0,width:1366,height:900},dock:{width:340,height:54},footers:[]};
test('recorder clears the overlapping fixed footer instead of covering finalization actions',()=>{
 const result=recorderDockPosition({...desktop,footers:[{left:0,right:1366,top:812,bottom:900}]});
 assert.equal(result.bottom,100);assert.ok(result.left>=0);assert.ok(result.left+340<=1366-12);
 assert.ok(900-result.bottom<=812-12);
});
test('recorder follows footer height changes and ignores a non-overlapping sidebar footer',()=>{
 assert.equal(recorderDockPosition({...desktop,footers:[{left:0,right:1366,top:752,bottom:900}]}).bottom,160);
 assert.equal(recorderDockPosition({...desktop,footers:[{left:0,right:500,top:812,bottom:900}]}).bottom,12);
});
test('mobile docking uses the visible keyboard viewport and keeps controls in bounds',()=>{
 const result=recorderDockPosition({layoutHeight:844,viewport:{left:0,top:0,width:390,height:420},dock:{width:332,height:58},footers:[]});
 assert.equal(result.maxWidth,366);assert.equal(result.bottom,436);assert.ok(result.left+332<=378);
});
test('offscreen or zero-height footers do not push the recorder out of the viewport',()=>{
 assert.equal(recorderDockPosition({...desktop,footers:[{left:0,right:1366,top:950,bottom:1000},{left:0,right:1366,top:400,bottom:400}]}).bottom,12);
});
