let owner:FieldRecorder|null=null;
export const recordingLimit=60000;
export class FieldRecorder {
 private recorder:MediaRecorder|null=null;private stream:MediaStream|null=null;private chunks:Blob[]=[];private timer:ReturnType<typeof setInterval>|null=null;private elapsed=0;private started=0;private cancelled=false;private finishing=false;private captureError='';
 private report:(state:'recording'|'paused',seconds:number)=>void;private complete:(blob:Blob)=>void;private failed:(message:string)=>void;
 constructor(report:(state:'recording'|'paused',seconds:number)=>void,complete:(blob:Blob)=>void,failed:(message:string)=>void){this.report=report;this.complete=complete;this.failed=failed}
 async start(){
  if(owner)throw new Error('Ολοκληρώστε την ενεργή υπαγόρευση πριν ανοίξετε άλλο μικρόφωνο.');
  // This identity is a global microphone lease, rather than a callback alias.
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  owner=this;
  try{if(typeof MediaRecorder==='undefined'||!navigator.mediaDevices?.getUserMedia)throw new Error('Η υπαγόρευση δεν υποστηρίζεται σε αυτό το πρόγραμμα περιήγησης.');
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(this.cancelled){stream.getTracks().forEach(t=>t.stop());return}this.stream=stream;
   const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(v=>MediaRecorder.isTypeSupported(v));
   const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);this.recorder=recorder;
   recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data)};
   recorder.onstop=()=>{const blob=new Blob(this.chunks,{type:recorder.mimeType||'audio/webm'});this.release();if(!this.cancelled){if(blob.size<800)this.failed(this.captureError||'Δεν καταγράφηκε αρκετός ήχος. Δοκιμάστε ξανά.');else if(blob.size>25*1024*1024)this.failed('Ο ήχος υπερβαίνει το όριο των 25 MB.');else this.complete(blob)}};
   // MediaRecorder emits its final data/stop events after an error. Retain that
   // captured audio when possible instead of cancelling and dropping the chunks.
   recorder.onerror=()=>{this.captureError='Η ηχογράφηση διακόπηκε. Το κείμενό σας διατηρείται.';this.finish()};
   stream.getAudioTracks().forEach(track=>{track.onended=()=>{if(!this.cancelled)this.finish()}});
   recorder.start(1000);this.started=performance.now();this.report('recording',0);this.timer=setInterval(()=>{const ms=this.time();this.report(recorder.state==='paused'?'paused':'recording',Math.floor(ms/1000));if(ms>=recordingLimit)this.finish()},250);
  }catch(e){this.release();if(!this.cancelled)throw e}
 }
 private time(){return this.elapsed+(this.recorder?.state==='recording'?performance.now()-this.started:0)}
 pause(){if(this.recorder?.state!=='recording'||this.finishing)return;this.elapsed=this.time();this.recorder.pause();this.report('paused',Math.floor(this.elapsed/1000))}
 resume(){if(this.recorder?.state!=='paused'||this.finishing)return;this.started=performance.now();this.recorder.resume();this.report('recording',Math.floor(this.elapsed/1000))}
 finish(){if(this.finishing||!this.recorder||this.recorder.state==='inactive')return;this.finishing=true;if(this.timer)clearInterval(this.timer);this.recorder.stop()}
 cancel(){this.cancelled=true;if(this.recorder&&this.recorder.state!=='inactive')this.recorder.stop();this.release()}
 private release(){if(this.timer)clearInterval(this.timer);this.timer=null;this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop()});this.stream=null;if(owner===this)owner=null}
}
