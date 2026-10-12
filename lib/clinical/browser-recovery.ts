// Session recovery expires 24 hours after the last edit; it is never a clinical record.
export const RECOVERY_TTL_MS=24*60*60*1000;
export function readRecovery(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,key:string,now=Date.now()):string|null{
 const value=storage.getItem(key);if(value===null)return null;
 const expiryKey=key+':expires';const raw=storage.getItem(expiryKey);
 // Existing in-session drafts gain a bounded lifetime on their first upgraded read.
 if(raw===null){storage.setItem(expiryKey,String(now+RECOVERY_TTL_MS));return value}
 const expiry=Number(raw);
 if(!Number.isFinite(expiry)||expiry<=now||expiry>now+RECOVERY_TTL_MS){storage.removeItem(key);storage.removeItem(expiryKey);return null}
 return value;
}
export function writeRecovery(storage:Pick<Storage,'setItem'>,key:string,value:string,now=Date.now()){
 storage.setItem(key+':expires',String(now+RECOVERY_TTL_MS));storage.setItem(key,value);
}
