// Test-only fixture: production field and visit stylesheet in a native modal.
// The modal uses the same showModal/top-layer behavior as VisitWorkspace.
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ClinicalTextField from '../components/dictation/ClinicalTextField';
import type {WritingCommit} from '../components/dictation/ClinicalTextField';
import '../app/visit-workspace.css';
const initial='Συνθετικό περιστατικό δοκιμής. Δεν αναφέρει αϋπνία.';
const qa={values:{impression:initial,protective_factors:''},commits:[] as {key:string;text:string;provenance:unknown}[],dirty:{} as Record<string,boolean>};
(window as unknown as {qa:typeof qa}).qa=qa;
function Fixture(){
 const [values,setValues]=useState(qa.values),[navigation,setNavigation]=useState(''),[footerHeight,setFooterHeight]=useState(88);
 const modal=useRef<HTMLDialogElement>(null),flushers=useRef(new Map<string,()=>Promise<void>>());
 const registerFlusher=useCallback((key:string,flush:()=>Promise<void>)=>{flushers.current.set(key,flush);return()=>{if(flushers.current.get(key)===flush)flushers.current.delete(key)}},[]);
 const dirty=useCallback((key:string,value:boolean)=>{qa.dirty[key]=value},[]);
 useEffect(()=>{modal.current?.showModal()},[]);
 function change(key:string,text:string){setValues(old=>{const next={...old,[key]:text};qa.values=next;return next})}
 async function confirm(key:string,text:string,commit:WritingCommit){qa.commits.push({key,text,provenance:commit.provenance});change(key,text)}
 async function navigate(){try{for(const flush of flushers.current.values())await flush();setNavigation('safe')}catch{setNavigation('blocked')}}
 return <dialog ref={modal} className="visit-dialog" aria-label="Κλινική επίσκεψη" onCancel={e=>{e.preventDefault();void navigate()}}>
  <header className="visit-dialog-title"><strong>Συνθετική δοκιμή — όχι πραγματικός ασθενής</strong><button type="button" onClick={()=>void navigate()}>Κλείσιμο επίσκεψης</button></header>
  <main className="runtime-session"><div className="visit-document">
   <h1>Αρχική αξιολόγηση — έλεγχος υπαγόρευσης</h1>
   <section className="visit-part"><header><h3>Εκτίμηση κινδύνου</h3></header>
    <ClinicalTextField sessionId="synthetic-visit" section="risk" fieldKey="protective_factors" title="Προστατευτικοί παράγοντες" value={values.protective_factors} onChange={text=>change('protective_factors',text)} onConfirm={(text,commit)=>confirm('protective_factors',text,commit)} registerFlusher={registerFlusher} onDirtyChange={dirty}/>
   </section>
   <section className="visit-part"><header><h3>Κλινική εκτίμηση</h3></header>
    <ClinicalTextField sessionId="synthetic-visit" section="assessment" fieldKey="impression" title="Κλινική αποτίμηση & ενέργειες" value={values.impression} onChange={text=>change('impression',text)} onConfirm={(text,commit)=>confirm('impression',text,commit)} registerFlusher={registerFlusher} onDirtyChange={dirty}/>
   </section>
   <div style={{height:220}}/>
  </div></main>
  <footer className="finalize-bar" data-testid="footer" style={{minHeight:footerHeight}}><button type="button" onClick={()=>void navigate()}>Οριστικοποίηση καταγραφής</button><button type="button" onClick={()=>void navigate()}>Συνέχεια αργότερα</button><output data-testid="navigation">{navigation}</output></footer>
  <button className="test-only" type="button" onClick={()=>setFooterHeight(value=>value===88?148:88)}>QA αλλαγή ύψους μπάρας</button>
 </dialog>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
