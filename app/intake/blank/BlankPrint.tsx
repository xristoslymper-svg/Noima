'use client';
import {useEffect} from 'react';

import {Printable,type IntakePayload} from '@/components/intake/PatientIntakeForm';
export default function BlankPrint({tool}:{tool:string}){

 useEffect(()=>{const timer=window.setTimeout(()=>window.print(),500);return()=>window.clearTimeout(timer)},[]);
 const payload:IntakePayload={id:'blank',status:'print',tools:[tool],channel:'print',expires_at:'',needs_identity:true,prefill:{}};
 return <main className="intake-shell">
  <div className="no-print" style={{maxWidth:850,margin:'20px auto',display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
   <p style={{fontSize:13,color:'#607669',maxWidth:620}}>{"Κενή εκτύπωση — δεν δημιουργείται ανάθεση ή φάκελος. Μετά τη συμπλήρωση, σαρώστε το έντυπο από τη Βιβλιοθήκη για καταχώριση."}</p>
   <button type="button" style={{background:'#285d45',color:'#fff',border:0,borderRadius:10,padding:'11px 18px',cursor:'pointer'}} onClick={()=>window.print()}>{" Εκτύπωση"}</button>
  </div>
  <Printable payload={payload}/>
 </main>;
}
