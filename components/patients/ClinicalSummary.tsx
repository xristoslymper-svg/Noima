'use client';
import Link from 'next/link';
import {useCalendarDialog} from '@/components/calendar/useCalendarDialog';
import {useEffect,useRef,useState} from 'react';
import {requestClinicalSummary} from '@/lib/clinical/summary-request';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {getDemoTesterId} from '@/lib/demo-tester';
import {buildSummaryContext,canonicalSummaryFindings,summaryContextHash,summaryContextKey,clinicDay,type Finding,type Evidence,categories} from '@/lib/clinical/summary-context';
import {formatClinicDateTime} from '@/lib/clinic-time';
import {evidenceText} from '@/lib/clinical/evidence-text';
type ResponseData={findings:Finding[];sources:Evidence[];context_hash:string;generated_at:string;mode:string;reason?:string|null;model?:string|null;stale?:boolean};
export default function ClinicalSummary({bundle:inputBundle,onSessions,onPsychometrics,onMedications,onHistory,compact=false}:{compact?:boolean;bundle:PatientBundle;onSessions:(id?:string)=>void;onPsychometrics:()=>void;onMedications:()=>void;onHistory:()=>void}){
 const [retry,setRetry]=useState(0);
 const [regenerate,setRegenerate]=useState(0);
 const handledRegeneration=useRef(0);
 const inputKey=summaryContextKey(inputBundle,clinicDay());
 const bundle=inputBundle;
 const [day,setDay]=useState(clinicDay());
 const [result,setResult]=useState<{key:string;data:ResponseData}|null>(null);
 const [state,setState]=useState<'loading'|'ready'|'unavailable'>('loading');
 const [evidence,setEvidence]=useState<Evidence|null>(null);
 const evidenceRef=useCalendarDialog(()=>setEvidence(null),false,Boolean(evidence));
 const key=summaryContextKey(bundle,day);const context=buildSummaryContext(bundle,day);
 useEffect(()=>{const timer=setInterval(()=>setDay(clinicDay()),30000);const refresh=()=>setRetry(n=>n+1);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[]);
 useEffect(()=>{
  let active=true;const controller=new AbortController();setState('loading');setEvidence(null);
  void (async()=>{
   const tester=getDemoTesterId();
   const fresh=inputBundle;const freshKey=summaryContextKey(fresh,day);const hash=await summaryContextHash(fresh,day);
   const force=regenerate>handledRegeneration.current;handledRegeneration.current=regenerate;
   const data=await requestClinicalSummary<ResponseData>({patientId:fresh.patient.id,tester,hash,force,signal:controller.signal});
   if(active){setResult({key:freshKey,data:{...data,stale:data.context_hash!==hash}});setState('ready')}
  })().catch(()=>{if(active){setResult(null);setState('unavailable')}});
  return()=>{active=false;controller.abort()};
 // key is the complete canonical record including date and policy version.
 },[inputKey,retry,day,regenerate]);
 const current=result?.key===key?result.data:null;
 const canonical=canonicalSummaryFindings(context);
 const findings=current?.stale?canonical:(current?.findings||canonical);
 const sources=current?.stale?context.sources:(current?.sources||context.sources);
 const next=bundle.appointments.filter(a=>a.status==='scheduled'&&Date.parse(a.scheduled_end)>Date.now()).sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start))[0];
 function navigate(source:Evidence){setEvidence(null);if(source.target==='sessions')onSessions(source.session_id);else if(source.target==='medications')onMedications();else if(source.target==='psychometrics')onPsychometrics();else if(source.target==='history')onHistory();else window.location.href='/calendar';}
 const order=[...categories].sort((a,b)=>{const priority:Record<string,number>={'Χρειάζεται επιβεβαίωση':0,'Κίνδυνος':1,'Παρενέργειες':2,'Τρέχουσα εικόνα':3,'Πορεία':4,'Αγωγή':5,'Ψυχομετρικά':6,'Πλάνο':7,'Σημαντικό ιστορικό':8};return priority[a]-priority[b]});
 const sourceHref=(source:Evidence)=>source.target==='calendar'?'/calendar':'/patients/demo/'+bundle.patient.id+'?tab='+source.target+(source.session_id?'&session='+source.session_id:'');
 const statusText=current
  ?`${current.stale?'Χρειάζεται ανανέωση · ':''}${formatClinicDateTime(current.generated_at)}`
  :state==='loading'?'Φόρτωση…':state==='ready'?'Καταγραφές φακέλου':'Προσωρινά μη διαθέσιμη';
 const sourceList=(finding:Finding)=>finding.source_ids.length>0&&<details className="summary-evidence"><summary>Προέλευση · {finding.source_ids.length} {finding.source_ids.length===1?'καταγραφή':'καταγραφές'}</summary><ul>{finding.source_ids.map(id=>{const source=sources.find(s=>s.id===id);return source?<li key={id}>{compact?<Link href={sourceHref(source)}>{source.label}</Link>:<button onClick={()=>setEvidence(source)}>{source.label}</button>}</li>:null})}</ul></details>;
 const themeSymbol:Record<string,string>={general:'◉',medication:'✚',course:'↗',risk:'⚑',psychometrics:'◌',plan:'→',context:'◎'};
 const fallbackTheme=(finding:Finding)=>finding.attention||finding.label==='Κίνδυνος'||finding.label==='Χρειάζεται επιβεβαίωση'?'risk':finding.label==='Αγωγή'||finding.label==='Παρενέργειες'?'medication':finding.label==='Πορεία'?'course':finding.label==='Ψυχομετρικά'?'psychometrics':finding.label==='Πλάνο'?'plan':finding.label==='Σημαντικό ιστορικό'?'context':'general';
 const presentationGroups=findings.reduce<{key:string;label:string;theme:string;items:Finding[]}[]>((groups,finding)=>{const label=finding.origin==='synthesis'&&finding.group_label?finding.group_label:finding.label;const theme=finding.origin==='synthesis'&&finding.theme?finding.theme:fallbackTheme(finding);const groupKey=theme+'|'+label;const existing=groups.find(group=>group.key===groupKey);if(existing)existing.items.push(finding);else groups.push({key:groupKey,label,theme,items:[finding]});return groups;},[]);
 const activeMedication=findings.filter(f=>f.label==='Αγωγή'&&/ενεργή/u.test(f.text)&&!/Προγραμματισμένη αλλαγή/u.test(f.text));
 const latestPlan=findings.filter(f=>f.label==='Πλάνο'||(f.origin==='synthesis'&&fallbackTheme(f)==='plan')).slice(0,2);
 const riskNow=findings.filter(f=>f.label==='Κίνδυνος').slice(0,1);
 const changeNow=findings.filter(f=>f.label==='Πορεία'||(f.origin==='synthesis'&&fallbackTheme(f)==='course')).slice(0,2);
 const quickRecall=[
  {key:'course',label:'Από την τελευταία επίσκεψη',items:changeNow},
  {key:'medication',label:'Τρέχουσα αγωγή',items:activeMedication},
  {key:'risk',label:'Κίνδυνος',items:riskNow},
  {key:'plan',label:'Τελευταίο πλάνο',items:latestPlan},
 ].filter(group=>group.items.length);

 return <section className={compact?"clinical-summary summary-compact summary-editorial":"clinical-summary summary-editorial-full"}>
  {compact?<>
   <header className="summary-editorial-head">
    <span className="summary-editorial-kicker">ΕΠΟΜΕΝΗ ΣΥΝΕΔΡΙΑ</span>
    <div className="summary-editorial-title"><span className="summary-editorial-spark" aria-hidden="true">✦</span><h2>Σύνοψη πριν τη συνεδρία</h2></div>
   </header>
   <div className="summary-editorial-surface">
    {findings.length?<div className="summary-semantic-groups">{presentationGroups.map(group=><section className="summary-semantic-group" key={group.key}>
     <h3><span aria-hidden="true">{themeSymbol[group.theme]||'◉'}</span>{group.label}</h3>
     <div className="summary-editorial-list">{group.items.map(f=><article key={f.key} className={f.attention?'summary-editorial-item attention':'summary-editorial-item'}><span className="summary-editorial-bullet" aria-hidden="true"/><div><p>{f.text}</p>{sourceList(f)}</div></article>)}</div>
    </section>)}</div>:<p className="summary-editorial-empty">{state==='loading'?'Η σύνοψη φορτώνει…':'Δεν υπάρχει ακόμη ολοκληρωμένη κλινική εικόνα για σύνοψη.'}</p>}
   </div>
   <footer className="summary-editorial-footer">
    <span>{statusText}</span>
    <button disabled={state==='loading'} onClick={()=>setRegenerate(n=>n+1)}>Ανανέωση</button>
    <Link href={'/patients/demo/'+bundle.patient.id+'?tab=summary'}>Πλήρης σύνοψη →</Link>
   </footer>
  </>:<>
   <header className="clinical-summary-head"><div><span className="summary-editorial-kicker">ΚΛΙΝΙΚΗ ΕΙΚΟΝΑ</span><div className="summary-editorial-title"><span className="summary-editorial-spark" aria-hidden="true">✦</span><h2>Κλινική επισκόπηση</h2></div><p>{current?`${current.mode==='synthesis'?'Επαληθευμένη σύνθεση':'Καταγραφές φακέλου'}${current.stale?' · ενημερώνεται':''} · ${formatClinicDateTime(current.generated_at)}`:state==='loading'?'Φόρτωση σύνοψης…':state==='ready'?'Η πρώτη σύνοψη προετοιμάζεται στο παρασκήνιο':'Η σύνοψη δεν είναι προσωρινά διαθέσιμη'}</p><button className="summary-refresh" disabled={state==='loading'} onClick={()=>setRegenerate(n=>n+1)}>Ανανέωση</button></div>{next&&<div className="summary-next-compact"><strong>{formatClinicDateTime(next.scheduled_start)}</strong><span>{next.session_id?'Συνδεδεμένη συνεδρία':'Επόμενο ραντεβού'}</span></div>}</header>
   {quickRecall.length>0&&<section className="patient-recall" aria-label="Γρήγορη κλινική ανάκληση"><span className="summary-editorial-kicker">ΜΕ ΜΙΑ ΜΑΤΙΑ</span><div className="patient-recall-grid">{quickRecall.map(group=><div className={"patient-recall-item "+group.key} key={group.key}><h3>{group.label}</h3>{group.items.map(f=><div key={f.key}><p>{f.text}</p>{sourceList(f)}</div>)}</div>)}</div></section>}
   <div className="summary-findings">{findings.some(f=>f.origin==='synthesis')&&<section className="summary-category summary-briefing">{presentationGroups.filter(group=>group.items.some(f=>f.origin==='synthesis')).map(group=><div className="summary-full-semantic-group" key={group.key}><h3><span aria-hidden="true">{themeSymbol[group.theme]||'◉'}</span>{group.label}</h3>{group.items.filter(f=>f.origin==='synthesis').map(f=><article key={f.key} className="summary-finding"><span className="summary-finding-dot" aria-hidden="true"/><div><p>{f.text}</p>{sourceList(f)}</div></article>)}</div>)}</section>}{order.map(category=>{const group=findings.filter(f=>f.origin!=='synthesis'&&f.label===category);if(!group.length)return null;return <section className="summary-category" key={category}><h3>{category}</h3>{group.map(f=><article key={f.key} className={f.attention?'summary-finding attention':'summary-finding'}><span className="summary-finding-dot" aria-hidden="true"/><div><p>{f.text}</p>{sourceList(f)}</div></article>)}</section>})}</div>
   {!findings.some(f=>f.origin==='synthesis'||f.label==='Τρέχουσα εικόνα')&&<p className="summary-empty">Δεν υπάρχει διαθέσιμη ολοκληρωμένη καταγραφή της τελευταίας κλινικής εικόνας. Πρόχειρες επισκέψεις δεν περιλαμβάνονται.</p>}
  </>}
  <style jsx global>{`.summary-refresh{border:0;background:transparent;color:#70857b;padding:6px 0;margin-top:7px;font-size:10px;cursor:pointer}.summary-refresh:hover{color:#315f52}.summary-evidence a{color:#456f62}.summary-editorial{gap:0;max-width:none}.summary-editorial-head{padding:1px 2px 14px}.summary-editorial-kicker{display:block;font-size:9px;letter-spacing:.16em;font-weight:800;color:#788b82;margin-bottom:7px}.summary-editorial-title{display:flex;align-items:center;gap:8px}.summary-editorial-title h2{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:21px;line-height:1.18;letter-spacing:-.035em;color:#172236}.summary-editorial-spark{font-size:21px;line-height:1;color:#315f52;transform:translateY(-1px)}.summary-editorial-surface{background:#edf6f0;border:1px solid #e1eee6;border-radius:15px;padding:18px 19px 17px}.summary-semantic-groups{display:flex;flex-direction:column;gap:13px}.summary-semantic-group+.summary-semantic-group{padding-top:12px;border-top:1px solid rgba(76,108,94,.10)}.summary-semantic-group>h3{display:flex;align-items:center;gap:7px;margin:0 0 4px;font-size:11px;font-weight:800;color:#32483f;letter-spacing:-.01em}.summary-semantic-group>h3 span{display:inline-flex;width:14px;justify-content:center;color:#4e7566;font-size:12px;font-weight:500}.summary-editorial-list{display:flex;flex-direction:column}.summary-editorial-item{display:grid;grid-template-columns:8px minmax(0,1fr);gap:9px;padding:5px 0}.summary-editorial-bullet{width:4px;height:4px;border-radius:50%;background:#617b70;margin-top:7px}.summary-editorial-item.attention .summary-editorial-bullet{width:5px;height:5px;background:#a06f32}.summary-editorial-item p{margin:0;color:#4f625a;font-size:12px;line-height:1.62;letter-spacing:-.005em}.summary-editorial-item.attention p{color:#554a3a}.summary-editorial .summary-evidence{margin-top:2px}.summary-editorial .summary-evidence>summary{display:inline-block;list-style:none;color:#789087;font-size:9px;cursor:pointer}.summary-editorial .summary-evidence>summary::-webkit-details-marker{display:none}.summary-editorial .summary-evidence ul{margin:4px 0 0;padding-left:14px}.summary-editorial .summary-evidence li{font-size:9px;line-height:1.45;color:#6b8077}.summary-editorial-empty{margin:0;color:#76877f;font-size:11px;line-height:1.55}.summary-editorial-footer{display:flex;align-items:center;gap:11px;padding:10px 2px 0;font-size:9px;color:#93a099}.summary-editorial-footer>span{margin-right:auto}.summary-editorial-footer button{border:0;background:transparent;padding:0;color:#73887e;font-size:9px;cursor:pointer}.summary-editorial-footer button:disabled{opacity:.45}.summary-editorial-footer a{color:#456f62;font-size:9px;font-weight:700;text-decoration:none}.patient-recall{margin:4px 0 20px;padding:18px 19px 17px;background:#fbfcfa;border:1px solid #e6ece7;border-radius:14px}.patient-recall .summary-editorial-kicker{margin-bottom:11px}.patient-recall-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 22px}.patient-recall-item{padding:11px 0;border-top:1px solid rgba(70,96,84,.10)}.patient-recall-item:nth-child(-n+2){border-top:0;padding-top:0}.patient-recall-item h3{margin:0 0 5px;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#72847b}.patient-recall-item p{margin:0;color:#2f4139;font-size:12px;line-height:1.55}.patient-recall-item.risk p{color:#51473b}.patient-recall .summary-evidence{margin-top:3px}.patient-recall .summary-evidence>summary{font-size:9px;color:#829087}@media(max-width:720px){.patient-recall-grid{grid-template-columns:1fr}.patient-recall-item,.patient-recall-item:nth-child(-n+2){padding:10px 0;border-top:1px solid rgba(70,96,84,.10)}.patient-recall-item:first-child{border-top:0;padding-top:0}}.summary-editorial-full .clinical-summary-head{align-items:flex-end}.summary-editorial-full .summary-editorial-title h2{font-family:Georgia,serif;font-size:30px;color:#263c33}.summary-editorial-full .summary-editorial-kicker{margin-bottom:5px}.summary-editorial-full .summary-editorial-spark{color:#477663}.summary-editorial-full .summary-briefing{background:#f1f7f3;border:1px solid #e4eee7;border-radius:14px;padding:17px 18px;margin-bottom:18px}.summary-full-semantic-group+.summary-full-semantic-group{margin-top:16px;padding-top:14px;border-top:1px solid rgba(76,108,94,.10)}.summary-full-semantic-group>h3{display:flex;align-items:center;gap:7px;margin:0 0 4px;color:#3f5d51;font-size:11px}.summary-full-semantic-group>h3 span{display:inline-flex;width:14px;justify-content:center;color:#4e7566;font-size:12px;font-weight:500}.summary-editorial-full .summary-briefing .summary-finding:last-child{border-bottom:0}@media(max-width:720px){.summary-editorial-title h2{font-size:19px}.summary-editorial-surface{padding:16px}.summary-editorial-footer{flex-wrap:wrap}.summary-editorial-footer>span{width:100%;margin-right:0}.summary-editorial-full .summary-editorial-title h2{font-size:26px}}`}</style>
  {evidence&&<div className="entry-modal-backdrop" onClick={()=>setEvidence(null)}><section ref={evidenceRef} tabIndex={-1} className="entry-modal summary-evidence-modal" role="dialog" aria-modal="true" aria-label="Κλινική πηγή" onClick={e=>e.stopPropagation()}><button className="entry-close" onClick={()=>setEvidence(null)} aria-label="Κλείσιμο">×</button><h2>{evidence.label}</h2>{evidence.date&&<p>{formatClinicDateTime(evidence.date)}</p>}<pre>{evidenceText(evidence)}</pre><footer><button onClick={()=>navigate(evidence)}>Άνοιγμα καταγραφής</button></footer></section></div>}
 </section>;
}
