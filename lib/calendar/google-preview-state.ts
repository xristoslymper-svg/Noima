import {googleBody,googleEventId,planSync,remoteSlot,equalSlot,type LocalEvent,type RemoteEvent,type Link,type Slot} from './google-sync';
export const previewWorkspace='00000000-0000-4000-8000-000000000001';
const initial:LocalEvent={id:'00000000-0000-4000-8000-000000000002',revision:'1',start:'2026-11-02T15:00:00+02:00',end:'2026-11-02T16:00:00+02:00',cancelled:false};
export type Comparison={localRevision:string;remoteEtag:string;local:Slot;remote:Slot};
export type PreviewState={connected:boolean;local:LocalEvent;remotes:RemoteEvent[];links:Link[];comparison:Comparison|null;message:string};
export type PreviewAction={type:'connect'|'disconnect'|'reset'|'sync'|'local-move'|'remote-move'|'local-cancel'|'remote-cancel'|'dismiss'}|{type:'resolve';choice:'local'|'remote';expected:Comparison};
export function createPreviewState(connected=false):PreviewState{return {connected,local:{...initial},remotes:[],links:[],comparison:null,message:connected?'Η συνθετική σύνδεση ενεργοποιήθηκε. Δεν έγινε ακόμη συγχρονισμός.':'Κανένα ημερολόγιο δεν έχει συνδεθεί.'}}
function remoteValue(local:LocalEvent,etag:string):RemoteEvent{return {id:googleEventId(previewWorkspace,local.id),etag,status:local.cancelled?'cancelled':'confirmed',...googleBody(previewWorkspace,local)}}
export function previewReducer(state:PreviewState,action:PreviewAction):PreviewState{
 if(action.type==='connect')return {...state,connected:true,message:'Η συνθετική σύνδεση ενεργοποιήθηκε. Δεν έγινε ακόμη συγχρονισμός.'};
 if(action.type==='disconnect')return {...state,connected:false,comparison:null,message:'Η συνθετική σύνδεση διακόπηκε. Δεν θα γίνουν άλλες αλλαγές.'};
 if(action.type==='reset')return createPreviewState(state.connected);
 if(!state.connected)return {...state,message:'Επιλέξτε πρώτα σύνδεση της προσομοίωσης. Δεν έγινε καμία αλλαγή.'};
 if(action.type==='dismiss')return {...state,comparison:null,message:'Η επίλυση αναβλήθηκε. Και οι δύο εκδοχές διατηρούνται.'};
 const current=state.remotes.find(x=>x.id===googleEventId(previewWorkspace,state.local.id));
 if(action.type==='resolve'){
  const slot=current&&remoteSlot(current,state.local),expected=action.expected;
  if(!state.comparison||!current||!slot||!['local','remote'].includes(action.choice)||state.local.locked||state.local.revision!==expected.localRevision||current.etag!==expected.remoteEtag||!equalSlot(state.local,expected.local)||!equalSlot(slot,expected.remote)){
   return {...state,comparison:null,message:'Οι ώρες άλλαξαν μετά τη σύγκριση. Συγχρονίστε ξανά πριν επιλέξετε.'};
  }
  const chosen=action.choice==='local'?state.local:slot;
  const local={...state.local,...chosen,revision:String(Number(state.local.revision)+1)};
  const remote=remoteValue(local,current.etag+'-resolved');
  return {...state,local,remotes:state.remotes.map(x=>x.id===remote.id?remote:x),links:[{localId:local.id,remoteId:remote.id,localRevision:local.revision,remoteEtag:remote.etag,slot:{start:local.start,end:local.end,cancelled:local.cancelled}}],comparison:null,message:action.choice==='local'?'Κρατήθηκε η επιλογή NOIMA και στις δύο συνθετικές πλευρές.':'Κρατήθηκε η επιλογή Google και στις δύο συνθετικές πλευρές.'};
 }
 if(action.type==='local-move'||action.type==='local-cancel')return {...state,local:{...state.local,revision:String(Number(state.local.revision)+1),cancelled:action.type==='local-cancel',...(action.type==='local-move'?{start:'2026-11-02T17:00:00+02:00',end:'2026-11-02T18:00:00+02:00'}:{})},message:'Η αλλαγή έγινε στο συνθετικό NOIMA. Πατήστε συγχρονισμό.'};
 if(action.type==='remote-move'||action.type==='remote-cancel')return {...state,remotes:state.remotes.map(x=>({...x,etag:x.etag+'x',status:action.type==='remote-cancel'?'cancelled':'confirmed',...(action.type==='remote-move'?{start:{dateTime:'2026-11-02T18:00:00+02:00'},end:{dateTime:'2026-11-02T19:00:00+02:00'}}:{})})),message:'Η αλλαγή έγινε στο συνθετικό Google. Πατήστε συγχρονισμό.'};
 const plan=planSync(previewWorkspace,[state.local],state.remotes,state.links);
 if(plan.conflicts.length){
  const slot=current&&remoteSlot(current,state.local);
  return {...state,comparison:plan.conflicts.every(x=>x.reason==='both_changed')&&slot&&current?{localRevision:state.local.revision,remoteEtag:current.etag,local:{start:state.local.start,end:state.local.end,cancelled:state.local.cancelled},remote:slot}:null,message:'Έγιναν διαφορετικές αλλαγές. Συγκρίνετε τις δύο εκδοχές και επιλέξτε ποια θα κρατηθεί. Δεν αντικαταστάθηκε καμία.'};
 }
 let local=state.local,remotes=[...state.remotes];const links=[...plan.links];
 for(const item of plan.push){const remote=remoteValue(local,'demo-'+local.revision);remotes=[...remotes.filter(x=>x.id!==remote.id),remote];links.push({localId:local.id,remoteId:item.remoteId,localRevision:local.revision,remoteEtag:remote.etag,slot:{start:local.start,end:local.end,cancelled:local.cancelled}})}
 for(const item of plan.pull){local={...local,...item.slot,revision:String(Number(local.revision)+1)};links.push({localId:local.id,remoteId:item.remote.id,localRevision:local.revision,remoteEtag:item.remote.etag,slot:item.slot})}
 return {...state,local,remotes,links,comparison:null,message:'Ο συνθετικός συγχρονισμός ολοκληρώθηκε. '+remotes.length+' συμβάν — χωρίς διπλότυπο.'};
}
