import {equalSlot,planSync,remoteSlot,type LocalEvent,type RemoteEvent,type Link,type Slot,type Conflict} from './google-sync';
export type Snapshot={workspace:string;locals:LocalEvent[];remotes:RemoteEvent[];links:Link[];syncToken?:string};
export interface SyncStore{
 /** Must be a durable, per owner+workspace+calendar lease, not process memory. */
 acquire():Promise<boolean>;release():Promise<void>;read():Promise<Snapshot>;
 /** Atomic cache merge+cursor write. Full reset clears only remote cache, never appointments/links. */
 cache(events:RemoteEvent[],syncToken:string,reset:boolean):Promise<void>;
 /** Compare-and-swap against current local revision, with overlap and started-visit guards. */
 applyLocal(id:string,expectedRevision:string,slot:Slot):Promise<LocalEvent>;
 /** Must reject if local revision moved since the provider write. */
 checkpoint(link:Link):Promise<void>;
}
export interface CalendarProvider{
 list(token?:string):Promise<{events:RemoteEvent[];syncToken:string}>;
 write(workspace:string,event:LocalEvent,etag?:string):Promise<RemoteEvent>;
}
export async function synchronizeCalendar(store:SyncStore,provider:CalendarProvider){
 if(!await store.acquire())throw new Error('sync_in_progress');
 const conflicts:Conflict[]=[];
 try{
  let snapshot=await store.read(),reset=false,result;
  try{result=await provider.list(snapshot.syncToken)}
  catch(error){
   if(!error||typeof error!=='object'||!('status'in error)||error.status!==410)throw error;
   result=await provider.list();reset=true;
  }
  // Do not commit a cursor before all pages have been fetched.
  await store.cache(result.events,result.syncToken,reset);
  snapshot=await store.read();
  const plan=planSync(snapshot.workspace,snapshot.locals,snapshot.remotes,snapshot.links);
  conflicts.push(...plan.conflicts);
  for(const link of plan.links)await store.checkpoint(link);
  for(const {local,remote,slot}of plan.pull){
   const saved=await store.applyLocal(local.id,local.revision,slot);
   await store.checkpoint({localId:local.id,remoteId:remote.id,localRevision:saved.revision,remoteEtag:remote.etag,slot});
  }
  for(const {local,remoteId,etag}of plan.push){
   try{
    const remote=await provider.write(snapshot.workspace,local,etag);
    const slot=remoteSlot(remote,local);
    const identity=remote.extendedProperties?.private;
    if(!slot||!equalSlot(local,slot)||(remote.status!=='cancelled'&&(identity?.noimaWorkspace!==snapshot.workspace||identity?.noimaEvent!==local.id))){
     conflicts.push({localId:local.id,remoteId,reason:'both_changed'});continue;
    }
    await store.checkpoint({localId:local.id,remoteId,localRevision:local.revision,remoteEtag:remote.etag,slot});
   }catch(error){
    if(error&&typeof error==='object'&&'status'in error&&error.status===412){conflicts.push({localId:local.id,remoteId,reason:'both_changed'});continue}
    throw error;
   }
  }
  return {conflicts,busy:plan.busy,pushed:plan.push.length,pulled:plan.pull.length};
 }finally{await store.release()}
}
