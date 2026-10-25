/**
 * Provider-independent reconciliation. External events never create patients.
 * A checkpoint advances only after both conditional writes have succeeded.
 */
export type Slot = {start:string;end:string;cancelled:boolean};
export type LocalEvent = Slot & {id:string;revision:string;locked?:boolean};
export type RemoteEvent = {id:string;etag:string;status?:string;start?:{dateTime?:string;date?:string};end?:{dateTime?:string;date?:string};transparency?:string;extendedProperties?:{private?:Record<string,string>}};
export type Link = {localId:string;remoteId:string;localRevision:string;remoteEtag:string;slot:Slot};
export type Conflict = {localId:string;remoteId:string;reason:'both_changed'|'locked_visit'|'invalid_time'|'identity_mismatch'|'overlap'};
export type Plan = {links:Link[];push:Array<{local:LocalEvent;remoteId:string;etag?:string}>;pull:Array<{local:LocalEvent;remote:RemoteEvent;slot:Slot}>;conflicts:Conflict[];busy:RemoteEvent[]};
export function equalSlot(a:Slot,b:Slot){return a.cancelled===b.cancelled&&(a.cancelled||(Date.parse(a.start)===Date.parse(b.start)&&Date.parse(a.end)===Date.parse(b.end)))}
export function remoteSlot(remote:RemoteEvent,fallback?:Slot):Slot|null{
 if(remote.status==='cancelled')return fallback?{...fallback,cancelled:true}:null;
 const start=remote.start?.dateTime,end=remote.end?.dateTime;
 if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start))return null;
 // Require explicit timezone offsets; never interpret server-local time.
 if(!/(Z|[+-]\d{2}:\d{2})$/.test(start)||!/(Z|[+-]\d{2}:\d{2})$/.test(end))return null;
 return {start,end,cancelled:false};
}
export function googleEventId(workspace:string,localId:string){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(workspace)||!uuid.test(localId))throw new Error('invalid_identity');
 return 'noima'+workspace.replaceAll('-','').toLowerCase()+localId.replaceAll('-','').toLowerCase();
}
export function googleBody(workspace:string,event:LocalEvent){
 return {summary:'Ραντεβού Ψ-space',visibility:'private',transparency:'opaque',
 start:{dateTime:event.start},end:{dateTime:event.end},
 extendedProperties:{private:{noimaWorkspace:workspace,noimaEvent:event.id}}};
}
export function planSync(workspace:string,locals:LocalEvent[],remotes:RemoteEvent[],previous:Link[]):Plan{
 const plan:Plan={links:[],push:[],pull:[],conflicts:[],busy:[]};
 // Last occurrence wins for provider pages delivering a revised event twice.
 const remoteMap=new Map(remotes.map(r=>[r.id,r]));
 const mapped=new Set<string>();
 for(const local of locals){
  const link=previous.find(x=>x.localId===local.id);
  const remoteId=link?.remoteId||googleEventId(workspace,local.id);
  const remote=remoteMap.get(remoteId);mapped.add(remoteId);
  const conflict=(reason:Conflict['reason'])=>plan.conflicts.push({localId:local.id,remoteId,reason});
  if(!remote){
   // A missing item in an incremental response is NOT a deletion.
   if(link){if(!equalSlot(local,link.slot))plan.push.push({local,remoteId,etag:link.remoteEtag});else plan.links.push(link)}else if(!local.cancelled)plan.push.push({local,remoteId});
   continue;
  }
  const identity=remote.extendedProperties?.private;
  if(remote.status!=='cancelled'&&(identity?.noimaWorkspace!==workspace||identity?.noimaEvent!==local.id)){conflict('identity_mismatch');continue}
  const slot=remoteSlot(remote,link?.slot||local);
  if(!slot){conflict('invalid_time');continue}
  if(equalSlot(local,slot)){
   plan.links.push({localId:local.id,remoteId,localRevision:local.revision,remoteEtag:remote.etag,slot});continue;
  }
  // Lost insert response/repeated sync: never duplicate or silently adopt a different time.
  if(!link){conflict('both_changed');continue}
  const localChanged=!equalSlot(local,link.slot),remoteChanged=!equalSlot(slot,link.slot);
  if(localChanged&&remoteChanged){conflict('both_changed');continue}
  if(remoteChanged){
   if(local.locked){conflict('locked_visit');continue}
   const overlap=!slot.cancelled&&locals.some(x=>x.id!==local.id&&!x.cancelled&&Date.parse(x.start)<Date.parse(slot.end)&&Date.parse(x.end)>Date.parse(slot.start));
   if(overlap){conflict('overlap');continue}
   plan.pull.push({local,remote,slot});
  }else if(localChanged)plan.push.push({local,remoteId,etag:remote.etag});
  else plan.links.push(link);
 }
 for(const remote of remoteMap.values()){
  if(!mapped.has(remote.id)&&remote.status!=='cancelled'&&remote.transparency!=='transparent')plan.busy.push(remote);
 }
 return plan;
}
