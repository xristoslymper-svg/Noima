/** Only an opaque operation ID is kept here; no clinical content. A lost response
 * or refresh must retry the same creation, never silently create another visit. */
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
export function visitStartKey(owner:string,patient:string,type:string,appointment?:string|null){
 return 'noima-visit-start:'+owner+':'+patient+':'+type+':'+(appointment||'unlinked');
}
export function visitStartRequest(storage:Storage,key:string,create:()=>string){
 const existing=storage.getItem(key);
 if(existing&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing))return existing;
 const id=create();storage.setItem(key,id);return id;
}
