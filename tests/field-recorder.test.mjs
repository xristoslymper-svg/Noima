import test from 'node:test';
import assert from 'node:assert/strict';
import {FieldRecorder} from '../lib/clinical/field-recorder.ts';
function harness(t){
 let now=0,tick,stopped=0;const instances=[];const track={stop(){stopped++},onended:null};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 class Recorder{state='inactive';mimeType='audio/webm';static isTypeSupported(){return true}constructor(){instances.push(this)}start(){this.state='recording'}pause(){this.state='paused'}resume(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['a'.repeat(1000)])});this.onstop()}}
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>stream}}});t.after(()=>descriptor?Object.defineProperty(globalThis,'navigator',descriptor):delete globalThis.navigator);
 t.mock.method(performance,'now',()=>now);t.mock.method(globalThis,'setInterval',fn=>{tick=fn;return 1});t.mock.method(globalThis,'clearInterval',()=>{});globalThis.MediaRecorder=Recorder;t.after(()=>delete globalThis.MediaRecorder);
 const states=[],blobs=[],errors=[];const recorder=new FieldRecorder((state,time)=>states.push({state,time}),blob=>blobs.push(blob),error=>errors.push(error));t.after(()=>recorder.cancel());
 return {recorder,instances,states,blobs,errors,track,advance:ms=>{now+=ms;tick?.()},stopped:()=>stopped,stream};
}
test('B: pause/resume preserves accumulated audio and excludes paused time from the 60-second limit',async t=>{
 const h=harness(t);await h.recorder.start();h.advance(15000);h.recorder.pause();h.advance(40000);assert.deepEqual(h.states.at(-1),{state:'paused',time:15});h.recorder.resume();h.advance(10000);assert.equal(h.states.at(-1).time,25);h.recorder.finish();h.recorder.finish();assert.equal(h.blobs.length,1);assert.equal(h.errors.length,0);assert.equal(await h.blobs[0].text(),'a'.repeat(1000));assert.ok(h.stopped()>0);
});
test('duration limit completes captured audio once; another segment can start afterwards',async t=>{
 const h=harness(t);await h.recorder.start();h.advance(60000);h.advance(1000);assert.equal(h.blobs.length,1);assert.equal(h.instances[0].state,'inactive');const next=new FieldRecorder(()=>{},()=>{},()=>{});await next.start();next.cancel();
});
test('H/F: global lease prevents two microphones; cancellation never transcribes; interrupted track finishes capture',async t=>{
 const h=harness(t);await h.recorder.start();const other=new FieldRecorder(()=>{},()=>{},()=>{});await assert.rejects(other.start(),/ενεργή υπαγόρευση/);h.track.onended();assert.equal(h.blobs.length,1);await other.start();other.cancel();assert.equal(h.blobs.length,1);
});
test('permission cancellation stops a late-granted stream without opening a recorder',async t=>{
 const h=harness(t);let grant;globalThis.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{grant=resolve});const starting=h.recorder.start();h.recorder.cancel();grant(h.stream);await starting;assert.equal(h.instances.length,0);assert.ok(h.stopped()>0);assert.equal(h.blobs.length,0);
});
test('a recorder error retains final captured audio when it can be recovered',async t=>{
 const h=harness(t);await h.recorder.start();h.instances[0].onerror();assert.equal(h.errors.length,0);assert.equal(h.blobs.length,1);assert.equal(h.instances[0].state,'inactive');assert.ok(h.stopped()>0);
});
