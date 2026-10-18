import type {LocalEvent,RemoteEvent} from './google-sync';
import {googleBody,googleEventId} from './google-sync';
export class GoogleCalendarError extends Error{
 constructor(public status:number,public operation:string){super('google_calendar_'+status+'_'+operation)}
}
type Fetcher=typeof fetch;
export class GoogleCalendarClient{
 constructor(private token:string,private calendarId:string,private request:Fetcher=fetch){}
 private url(path:string){return 'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(this.calendarId)+'/events'+path}
 private async send(path:string,init:RequestInit={}){
  const response=await this.request(this.url(path),{...init,headers:{Authorization:'Bearer '+this.token,...init.headers},cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new GoogleCalendarError(response.status,init.method||'GET');
  return response;
 }
 async list(syncToken?:string):Promise<{events:RemoteEvent[];syncToken:string}>{
  const events:RemoteEvent[]=[];let page:string|undefined;
  do{
   const query=new URLSearchParams({singleEvents:'true',showDeleted:'true',maxResults:'2500'});
   if(syncToken)query.set('syncToken',syncToken);if(page)query.set('pageToken',page);
   const response=await this.send('?'+query);
   const data=await response.json() as {items?:RemoteEvent[];nextPageToken?:string;nextSyncToken?:string};
   events.push(...(data.items||[]));page=data.nextPageToken;
   if(!page){if(!data.nextSyncToken)throw new Error('missing_sync_token');return {events,syncToken:data.nextSyncToken}}
  }while(page);
  throw new Error('incomplete_sync');
 }
 async get(id:string){return (await this.send('/'+encodeURIComponent(id))).json() as Promise<RemoteEvent>}
 async write(workspace:string,event:LocalEvent,etag?:string):Promise<RemoteEvent>{
  const id=googleEventId(workspace,event.id);
  if(event.cancelled){
   if(!etag)throw new Error('etag_required');
   try{await this.send('/'+id+'?sendUpdates=none',{method:'DELETE',headers:{'If-Match':etag}})}
   catch(error){if(!(error instanceof GoogleCalendarError)||![404,410].includes(error.status))throw error}
   return {id,etag:'deleted',status:'cancelled'};
  }
  const body=JSON.stringify({...googleBody(workspace,event),...(!etag?{id}:{})});
  try{
   return (await this.send((etag?'/'+id:'')+'?sendUpdates=none',{method:etag?'PATCH':'POST',headers:{'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},body})).json() as Promise<RemoteEvent>;
  }catch(error){
   // The stable ID survives timeouts/retries. 409 is read back for reconciliation,
   // never overwritten. The planner must compare this response before checkpointing.
   if(!etag&&error instanceof GoogleCalendarError&&error.status===409)return this.get(id);
   throw error;
  }
 }
}
