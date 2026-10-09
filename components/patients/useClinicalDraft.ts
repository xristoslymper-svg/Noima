'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {recoveredClinicalDraftDisposition,shouldAdoptClinicalDraftServer} from '@/lib/clinical/draft-reconciliation';
function clearRecovery(key:string){try{sessionStorage.removeItem(key)}catch{}}
// Session-local recovery retains unsaved text; recovery never silently overwrites a newer server version.
export function useClinicalDraft<T>({storageKey,initial,version,write,onSaved,onDirty,quietRecovery=false}:{storageKey:string;initial:T;version:number|null;write:(value:T,version:number|null)=>Promise<{value:T;version:number}>;onSaved:()=>Promise<unknown>;onDirty:(dirty:boolean)=>void;quietRecovery?:boolean}){
 const [value,setValue]=useState(initial),[error,setError]=useState(''),[saving,setSaving]=useState(false),[savedAt,setSavedAt]=useState('');
 const [olderRecovery,setOlderRecovery]=useState<T|null>(null);
 const latest=useRef(initial),saved=useRef(JSON.stringify(initial)),v=useRef(version),flight=useRef<Promise<void>|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const blocked=useRef(false); const callbacks=useRef({write,onSaved,onDirty});callbacks.current={write,onSaved,onDirty};
 const incomingJson=JSON.stringify(initial);
 const backupKey=storageKey+':older-recovery';
 const recoveredKey=useRef<string|null>(null);
 const backupOlder=(value:T,originalVersion:number|null)=>{
  try{
   sessionStorage.setItem(backupKey,JSON.stringify({value,version:originalVersion}));
   setOlderRecovery(value);
   return true;
  }catch{return false}
 };
 const flush=useCallback(async function flush():Promise<void>{
  if(timer.current)clearTimeout(timer.current);
  if(blocked.current)throw new Error('Ελέγξτε τη σύγκρουση πριν συνεχίσετε.');
  if(flight.current){await flight.current;if(JSON.stringify(latest.current)!==saved.current)return flush();return}
  if(JSON.stringify(latest.current)===saved.current)return;
  const snapshot=latest.current;setSaving(true);setError('');
  const task=(async()=>{try{const result=await callbacks.current.write(snapshot,v.current);v.current=result.version;saved.current=JSON.stringify(result.value);
   if(JSON.stringify(latest.current)===JSON.stringify(snapshot)){latest.current=result.value;setValue(result.value);clearRecovery(storageKey)}
   else try{sessionStorage.setItem(storageKey,JSON.stringify({value:latest.current,version:v.current}))}catch{}
   callbacks.current.onDirty(JSON.stringify(latest.current)!==saved.current);setSavedAt(new Date().toLocaleTimeString('el-GR',{timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));try{await callbacks.current.onSaved()}catch{/* the write is committed; a later canonical reload can recover the view */}
  }catch(e){
   const message=e instanceof Error?e.message:'Αποτυχία αποθήκευσης';
   const conflict=/άλλαξε|Επαναφορτώστε|stale/.test(message);
   if(conflict&&quietRecovery){
    backupOlder(latest.current,v.current);
    blocked.current=true;
    setError('');
    try{await callbacks.current.onSaved()}catch{/* The saved patient record is unchanged. */}
    return;
   }
   if(conflict)blocked.current=true;
   setError(message);callbacks.current.onDirty(true);throw e
  }})();
  flight.current=task;try{await task}finally{flight.current=null;setSaving(false)}
  if(blocked.current&&quietRecovery)return;
  if(JSON.stringify(latest.current)!==saved.current)return flush();
 },[storageKey,quietRecovery]);
 useEffect(()=>{
  // Recovery belongs to opening an editor, not to each autosave version update.
  // Keep this guard through Strict Mode effect replay as well.
  if(recoveredKey.current===storageKey)return;
  recoveredKey.current=storageKey;
  try{
   const older=sessionStorage.getItem(backupKey);
   if(older){const parsed=JSON.parse(older);if(parsed?.value)setOlderRecovery(parsed.value as T)}
   const text=sessionStorage.getItem(storageKey);
   if(!text)return;
   const local=JSON.parse(text) as {value:T;version:number|null};
   const disposition=recoveredClinicalDraftDisposition({
    recoveredJson:JSON.stringify(local.value),serverJson:saved.current,
    recoveredVersion:local.version,serverVersion:version,
   });
   if(disposition==='same'){clearRecovery(storageKey);return}
   if(quietRecovery&&disposition==='archive'){
    backupOlder(local.value,local.version);
    clearRecovery(storageKey);
    return;
   }
   latest.current=local.value;v.current=local.version;setValue(local.value);
   callbacks.current.onDirty(true);
   if(disposition==='retry'){
    // A same-version draft is safe to retry through optimistic locking.
    timer.current=setTimeout(()=>void flush().catch(()=>{}),700);
   }else{
    blocked.current=true;
    setError('Ανακτήθηκε μη αποθηκευμένο κείμενο. Συγκρίνετε με την αποθηκευμένη έκδοση.');
   }
  }catch{/* storage may be unavailable */}
 },[storageKey,backupKey,quietRecovery,version,flush]);
 // Approval of a patient-submitted history can increment the server version
 // while the editor stays mounted. When the local form is clean, use the new
 // canonical value/version immediately rather than treating it as a stale edit.
 // Genuine local changes are never overwritten.
 useEffect(()=>{
  if(flight.current)return;
  // Once the new canonical version arrives, retire a conflicted history edit
  // to a local backup and make the clinician's live view current again.
  if(quietRecovery&&blocked.current&&version!==null&&v.current!==null&&version>v.current){
   if(JSON.stringify(latest.current)!==incomingJson)backupOlder(latest.current,v.current);
   if(timer.current)clearTimeout(timer.current);
   latest.current=initial;saved.current=incomingJson;v.current=version;
   blocked.current=false;setError('');setValue(initial);
   clearRecovery(storageKey);callbacks.current.onDirty(false);
   return;
  }
  // A pending parent refresh must not downgrade a newer successful local write.
  if(version!==null&&v.current!==null&&version<v.current)return;
  if(!shouldAdoptClinicalDraftServer({
   localJson:JSON.stringify(latest.current),savedJson:saved.current,
   incomingJson,localVersion:v.current,incomingVersion:version,
  }))return;
  if(timer.current)clearTimeout(timer.current);
  latest.current=initial;saved.current=incomingJson;v.current=version;
  blocked.current=false;setError('');setValue(initial);
  clearRecovery(storageKey);callbacks.current.onDirty(false);
 },[initial,incomingJson,version,storageKey,saving]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
 function change(update:T|((current:T)=>T)){const next=typeof update==='function'?(update as (current:T)=>T)(latest.current):update;latest.current=next;setValue(next);callbacks.current.onDirty(JSON.stringify(next)!==saved.current);try{sessionStorage.setItem(storageKey,JSON.stringify({value:next,version:v.current}))}catch{};if(timer.current)clearTimeout(timer.current);if(!blocked.current)timer.current=setTimeout(()=>void flush().catch(()=>{}),700)}
 function acceptServer(next:T,nextVersion:number|null){if(timer.current)clearTimeout(timer.current);if(JSON.stringify(latest.current)!==JSON.stringify(next)&&JSON.stringify(latest.current)!==saved.current&&!backupOlder(latest.current,v.current)){setError('Δεν διατηρήθηκε το τοπικό αντίγραφο. Το κείμενό σας παραμένει ανοιχτό.');return}latest.current=next;saved.current=JSON.stringify(next);v.current=nextVersion;setValue(next);blocked.current=false;setError('');clearRecovery(storageKey);callbacks.current.onDirty(false)}
 function resolve(next:T,server:T,serverVersion:number|null){v.current=serverVersion;saved.current=JSON.stringify(server);blocked.current=false;setError('');change(next)}
 // On a genuine conflict, allowing navigation must not discard local text.
 // Preserve a recoverable copy first; never force a stale server write.
 function dismissOlderRecovery(){try{sessionStorage.removeItem(backupKey)}catch{};setOlderRecovery(null)}
 function preserveConflictForNavigation(){
  if(!blocked.current)return false;
  try{sessionStorage.setItem(storageKey,JSON.stringify({value:latest.current,version:v.current}));return true}catch{return false}
 }
 return {value,change,flush,error,saving,savedAt,acceptServer,resolve,preserveConflictForNavigation,olderRecovery,dismissOlderRecovery,version:()=>v.current};
}
