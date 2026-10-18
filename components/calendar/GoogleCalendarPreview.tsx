'use client';
import {useReducer,useState} from 'react';
import {remoteSlot,type Slot} from '@/lib/calendar/google-sync';
import {createPreviewState,previewReducer} from '@/lib/calendar/google-preview-state';
function clock(slot:Slot){
 if(slot.cancelled)return 'Ακυρωμένο';
 const format=new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'});
 return format.format(new Date(slot.start))+' – '+new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit'}).format(new Date(slot.end));
}
export default function GoogleCalendarPreview(){
 const [state,dispatch]=useReducer(previewReducer,undefined,()=>createPreviewState());
 const [consent,setConsent]=useState(false);
 const current=state.remotes[0],slot=current&&remoteSlot(current,state.local),comparison=state.comparison;
 return <section className="mailbox-settings"><p><strong>Απομονωμένη συνθετική προσομοίωση</strong></p><p>Δεν συνδέεται με Google ή βάση. Όλες οι αλλαγές μένουν προσωρινά στον browser. Η πραγματική σύνδεση δεν έχει ενεργοποιηθεί.</p>
 <h2>Το ημερολόγιό μου</h2><p>Η σύνδεση είναι προαιρετική και ξεκινά μόνο με δική σας επιλογή. Η σύνδεση στο NOIMA δεν δίνει αυτόματα πρόσβαση στο Google Calendar.</p>
 {!state.connected?<><label className="pilot-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Θέλω να δοκιμάσω τη σύνδεση ημερολογίου με συνθετικά δεδομένα.</label><div className="pilot-actions"><button disabled={!consent} onClick={()=>dispatch({type:'connect'})}>Σύνδεση ημερολογίου — δοκιμή</button></div></>:<><p className="mailbox-connected">Συνδεδεμένη μόνο η προσομοίωση · κανένας λογαριασμός Google.</p><button onClick={()=>{dispatch({type:'disconnect'});setConsent(false)}}>Αποσύνδεση προσομοίωσης</button></>}
 <hr/><h2>Ραντεβού δοκιμής</h2><p>NOIMA: <strong>{clock(state.local)}</strong></p><p>Google: <strong>{slot?clock(slot):'Δεν έχει δημιουργηθεί'}</strong></p><small>Ώρες Ελλάδας · Europe/Athens</small>
 <div className="pilot-actions"><button disabled={!state.connected} onClick={()=>dispatch({type:'sync'})}>Συγχρονισμός δοκιμής</button><button onClick={()=>dispatch({type:'reset'})}>Επαναφορά δοκιμής</button></div>
 {comparison&&<section aria-labelledby="calendar-conflict-title"><hr/><h2 id="calendar-conflict-title">Ποια εκδοχή θέλετε να κρατήσετε;</h2><p>Η επιλογή σας θα εφαρμοστεί και στις δύο συνθετικές πλευρές. Μέχρι να επιλέξετε, δεν αλλάζει καμία εκδοχή.</p><dl><dt>Στο NOIMA</dt><dd>{clock(comparison.local)}</dd><dt>Στο Google Calendar</dt><dd>{clock(comparison.remote)}</dd></dl><div className="pilot-actions"><button onClick={()=>dispatch({type:'resolve',choice:'local',expected:comparison})}>Διατήρηση NOIMA · {clock(comparison.local)}</button><button onClick={()=>dispatch({type:'resolve',choice:'remote',expected:comparison})}>Διατήρηση Google · {clock(comparison.remote)}</button><button onClick={()=>dispatch({type:'dismiss'})}>Απόφαση αργότερα</button></div></section>}
 <details className="account-details"><summary>Δοκιμή αλλαγών</summary><p>Συνδέστε πρώτα την προσομοίωση και συγχρονίστε. Μετά αλλάξτε ώρα ή ακυρώστε από τη μία πλευρά. Για σύγκρουση, αλλάξτε και τις δύο ώρες πριν συγχρονίσετε.</p><div className="pilot-actions"><button disabled={!state.connected||state.local.cancelled} onClick={()=>dispatch({type:'local-move'})}>Μεταφορά από NOIMA στις 17:00</button><button disabled={!state.connected||!current||current.status==='cancelled'} onClick={()=>dispatch({type:'remote-move'})}>Μεταφορά από Google στις 18:00</button><button disabled={!state.connected||state.local.cancelled} onClick={()=>dispatch({type:'local-cancel'})}>Ακύρωση από NOIMA</button><button disabled={!state.connected||!current||current.status==='cancelled'} onClick={()=>dispatch({type:'remote-cancel'})}>Ακύρωση από Google</button></div></details><p role="status" aria-live="polite">{state.message}</p><small>Εξωτερικός τίτλος: «Ραντεβού NOIMA», χωρίς στοιχεία ασθενή ή κλινικές σημειώσεις.</small></section>
}
