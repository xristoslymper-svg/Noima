'use client';
import {useState} from 'react';
import {googleBody,googleEventId,planSync,type Link,type LocalEvent,type RemoteEvent,type Slot} from '@/lib/calendar/google-sync';
const workspace='00000000-0000-4000-8000-000000000001';
const initial:LocalEvent={id:'00000000-0000-4000-8000-000000000002',revision:'1',start:'2026-11-02T15:00:00+02:00',end:'2026-11-02T16:00:00+02:00',cancelled:false};
function clock(slot:Slot){return slot.cancelled?'Ακυρωμένο':new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(slot.start))}
export default function GoogleCalendarPreview(){
 const [local,setLocal]=useState<LocalEvent>(initial),[remote,setRemote]=useState<RemoteEvent[]>([]),[links,setLinks]=useState<Link[]>([]),[message,setMessage]=useState('Έτοιμο για την πρώτη δοκιμή.');
 function localChange(cancelled=false){setLocal(x=>({...x,revision:String(Number(x.revision)+1),cancelled,...(!cancelled?{start:'2026-11-02T17:00:00+02:00',end:'2026-11-02T18:00:00+02:00'}:{})}));setMessage('Η αλλαγή έγινε στο συνθετικό NOIMA. Πατήστε συγχρονισμό.')}
 function remoteChange(cancelled=false){setRemote(xs=>xs.map(x=>({...x,etag:x.etag+'x',status:cancelled?'cancelled':'confirmed',...(!cancelled?{start:{dateTime:'2026-11-02T18:00:00+02:00'},end:{dateTime:'2026-11-02T19:00:00+02:00'}}:{})})));setMessage('Η αλλαγή έγινε στο συνθετικό Google. Πατήστε συγχρονισμό.')}
 function sync(){
  const plan=planSync(workspace,[local],remote,links);if(plan.conflicts.length){setMessage('Έγιναν διαφορετικές αλλαγές και στις δύο πλευρές. Διατηρήθηκαν και οι δύο εκδοχές· χρειάζεται επιλογή πριν συνεχιστεί ο συγχρονισμός.');return}
  const nextLinks=[...plan.links];let nextRemote=[...remote],nextLocal=local;
  for(const item of plan.push){
   const value:RemoteEvent={id:item.remoteId,etag:'demo-'+local.revision,status:local.cancelled?'cancelled':'confirmed',...googleBody(workspace,local)};
   nextRemote=[...nextRemote.filter(x=>x.id!==value.id),value];nextLinks.push({localId:local.id,remoteId:value.id,localRevision:local.revision,remoteEtag:value.etag,slot:{start:local.start,end:local.end,cancelled:local.cancelled}});
  }
  for(const item of plan.pull){nextLocal={...local,...item.slot,revision:String(Number(local.revision)+1)};nextLinks.push({localId:local.id,remoteId:item.remote.id,localRevision:nextLocal.revision,remoteEtag:item.remote.etag,slot:item.slot})}
  setLocal(nextLocal);setRemote(nextRemote);setLinks(nextLinks);setMessage('Ο συνθετικός συγχρονισμός ολοκληρώθηκε. '+nextRemote.length+' συμβάν στο Google — χωρίς διπλότυπο.');
 }
 const current=remote.find(x=>x.id===googleEventId(workspace,initial.id));
 return <section className="mailbox-settings"><p><strong>Απομονωμένη συνθετική προσομοίωση</strong></p><p>Οι ενέργειες αυτής της οθόνης λειτουργούν μόνο στη μνήμη του browser. Δεν συνδέονται με Google ή βάση και χάνονται με ανανέωση. Η πραγματική σύνδεση δεν έχει ενεργοποιηθεί.</p><h2>Ραντεβού δοκιμής</h2><p>NOIMA: <strong>{clock(local)}</strong></p><p>Google: <strong>{current?current.status==='cancelled'?'Ακυρωμένο':clock({start:current.start!.dateTime!,end:current.end!.dateTime!,cancelled:false}):'Δεν έχει δημιουργηθεί'}</strong></p><div className="pilot-actions"><button onClick={sync}>Συγχρονισμός δοκιμής</button><button onClick={()=>{setLocal(initial);setRemote([]);setLinks([]);setMessage('Η δοκιμή ξεκίνησε ξανά.')}}>Επαναφορά δοκιμής</button></div><details className="account-details"><summary>Δοκιμή αλλαγών</summary><p>Συγχρονίστε πρώτα και μετά αλλάξτε ώρα ή ακυρώστε από τη μία πλευρά. Επαναλάβετε τον συγχρονισμό για να ελέγξετε τα διπλότυπα.</p><div className="pilot-actions"><button disabled={local.cancelled} onClick={()=>localChange()}>Μεταφορά από NOIMA στις 17:00</button><button disabled={!current||current.status==='cancelled'} onClick={()=>remoteChange()}>Μεταφορά από Google στις 18:00</button><button disabled={local.cancelled} onClick={()=>localChange(true)}>Ακύρωση από NOIMA</button><button disabled={!current||current.status==='cancelled'} onClick={()=>remoteChange(true)}>Ακύρωση από Google</button></div></details><p role="status" aria-live="polite">{message}</p><small>Στο εξωτερικό ημερολόγιο χρησιμοποιείται ο γενικός τίτλος «Ραντεβού NOIMA». Δεν εξάγονται στοιχεία ασθενή ή κλινικές σημειώσεις.</small></section>
}
