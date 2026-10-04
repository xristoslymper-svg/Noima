'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
function clearRecovery(key:string){try{sessionStorage.removeItem(key)}catch{}}
// Session-local recovery retains unsaved text; recovery never silently overwrites a newer server version.
export function useClinicalDraft<T>({storageKey,initial,version,write,onSaved,onDirty}:{storageKey:string;initial:T;version:number|null;write:(value:T,version:number|null)=>Promise<{value:T;version:number}>;onSaved:()=>Promise<unknown>;onDirty:(dirty:boolean)=>void}){
 const [value,setValue]=useState(initial),[error,setError]=useState(''),[saving,setSaving]=useState(false),[savedAt,setSavedAt]=useState('');
 const latest=useRef(initial),saved=useRef(JSON.stringify(initial)),v=useRef(version),flight=useRef<Promise<void>|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const blocked=useRef(false); const callbacks=useRef({write,onSaved,onDirty});callbacks.current={write,onSaved,onDirty};
 const flush=useCallback(async function flush():Promise<void>{
  if(timer.current)clearTimeout(timer.current);
  if(blocked.current)throw new Error('Ελέγξτε τη σύγκρουση πριν συνεχίσετε.');
  if(flight.current){await flight.current;if(JSON.stringify(latest.current)!==saved.current)return flush();return}
  if(JSON.stringify(latest.current)===saved.current)return;
  const snapshot=latest.current;setSaving(true);setError('');
  const task=(async()=>{try{const result=await callbacks.current.write(snapshot,v.current);v.current=result.version;saved.current=JSON.stringify(result.value);
   if(JSON.stringify(latest.current)===JSON.stringify(snapshot)){latest.current=result.value;setValue(result.value);clearRecovery(storageKey)}
   callbacks.current.onDirty(JSON.stringify(latest.current)!==saved.current);setSavedAt(new Date().toLocaleTimeString('el-GR',{timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));await callbacks.current.onSaved();
  }catch(e){const message=e instanceof Error?e.message:'Αποτυχία αποθήκευσης';if(/άλλαξε|Επαναφορτώστε|stale/.test(message))blocked.current=true;setError(message);callbacks.current.onDirty(true);throw e}})();
  flight.current=task;try{await task}finally{flight.current=null;setSaving(false)}
  if(JSON.stringify(latest.current)!==saved.current)return flush();
 },[storageKey]);
 useEffect(()=>{try{const text=sessionStorage.getItem(storageKey);if(text){const local=JSON.parse(text);if(JSON.stringify(local.value)!==saved.current){latest.current=local.value;v.current=local.version;setValue(local.value);blocked.current=true;setError('Ανακτήθηκε μη αποθηκευμένο κείμενο. Συγκρίνετε με την αποθηκευμένη έκδοση.');callbacks.current.onDirty(true)}}}catch{/* storage may be unavailable */}},[storageKey]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
 function change(next:T){latest.current=next;setValue(next);callbacks.current.onDirty(JSON.stringify(next)!==saved.current);try{sessionStorage.setItem(storageKey,JSON.stringify({value:next,version:v.current}))}catch{};if(timer.current)clearTimeout(timer.current);if(!blocked.current)timer.current=setTimeout(()=>void flush().catch(()=>{}),700)}
 function acceptServer(next:T,nextVersion:number|null){if(timer.current)clearTimeout(timer.current);latest.current=next;saved.current=JSON.stringify(next);v.current=nextVersion;setValue(next);blocked.current=false;setError('');clearRecovery(storageKey);callbacks.current.onDirty(false)}
 function resolve(next:T,server:T,serverVersion:number|null){v.current=serverVersion;saved.current=JSON.stringify(server);blocked.current=false;setError('');change(next)}
 return {value,change,flush,error,saving,savedAt,acceptServer,resolve,version:()=>v.current};
}
