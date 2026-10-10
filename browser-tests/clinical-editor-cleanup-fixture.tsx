// Synthetic browser-only API state. This fixture is never imported by app/.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import PatientSession from '../components/patients/PatientSession';
import {initialDocument,type VisitDocument} from '../lib/clinical/visit-document';
import type {PatientBundle} from '../lib/patients/demo-runtime';
import '../app/globals.css';
import '../app/clinical-refinement.css';
import '../app/visit-workspace.css';
import '../app/mobile.css';
import '../app/initial-assessment.css';
import '../app/clinical-editor-surfaces.css';
const date='2026-10-10T11:49:00Z',sessionId='synthetic-current',priorId='synthetic-prior';
const followup=new URLSearchParams(location.search).has('followup');
const assessment=initialDocument('assessment');
assessment.fields.find(f=>f.key==='formulation')!.text='Παλαιότερη σημείωση δοκιμής — διατηρείται αυτούσια.';
const priorMse=initialDocument('mse');priorMse.fields[2].text='Υποκειμενικό συναίσθημα: Αγχώδες';
const section=(key:string,content:string,document?:VisitDocument,id=sessionId)=>({id:id+'-'+key,session_id:id,patient_id:'synthetic-patient',section_key:key,content,document,source:'manual',version:1,updated_at:date});
let bundle={
 patient:{id:'synthetic-patient',first_name:'Συνθετικός',last_name:'Ασθενής',reported_age:36,chief_complaint:'',created_at:date,updated_at:date,phone:'',email:'',amka:'',status:'active'},
 sessions:[{id:sessionId,session_type:followup?'follow_up':'initial_assessment',status:'draft',version:1,started_at:date,completed_at:null,updated_at:date},...(followup?[{id:priorId,session_type:'initial_assessment',status:'completed',version:1,started_at:'2026-10-01T10:00:00Z',completed_at:'2026-10-01T11:00:00Z',updated_at:date}]:[])],
 sections:[section('interview','Συνθετικό περιστατικό: αναφέρει κόπωση. Δεν αναφέρει αϋπνία.'),section('mse','',initialDocument('mse')),section('assessment','',assessment),...(followup?[section('mse',priorMse.fields[2].text,priorMse,priorId)]:[])],
 risks:[],history:null,medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[{id:'synthetic-proposal',session_id:sessionId,section_key:'interview',status:'approved',approved_at:date,created_at:date,transcript:'Αυτούσια συνθετική μεταγραφή.',approved_text:'Συνθετικό εγκεκριμένο κείμενο.',proposal:{}}],addenda:[],corrections:[],assessments:[],appointments:[]
} as unknown as PatientBundle;
const writes:Record<string,unknown>[]=[];
Object.assign(window,{cleanupQA:{writes,get bundle(){return bundle}}});
window.fetch=async(input,init)=>{
 const url=String(input);
 if(!url.startsWith('/api/'))throw new Error('External requests disabled in synthetic fixture');
 if(!init?.body)return Response.json({bundle});
 const body=JSON.parse(String(init.body));writes.push(body);
 if(body.action==='save_document'||body.action==='save_section'){
  const old=bundle.sections.find(s=>s.session_id===body.session_id&&s.section_key===body.section_key);
  if(old&&body.expected_version!==old.version)return Response.json({error:'Synthetic version conflict'},{status:409});
  const content=body.document?body.document.fields.filter((f:{text:string})=>f.text.trim()).map((f:{text:string})=>f.text).join('\n'):body.content;
  const saved={...section(body.section_key,content,body.document),version:(old?.version??0)+1};
  bundle={...bundle,sections:[...bundle.sections.filter(s=>s.id!==saved.id),saved]};
  return Response.json({section:saved});
 }
 throw new Error('Unexpected write '+body.action);
};
function Fixture(){
 const [value,setValue]=useState(bundle);
 const reload=async()=>{setValue({...bundle});return bundle};
 return <main style={{maxWidth:1100,margin:'24px auto',padding:'0 20px'}}><p style={{fontSize:12}}>NOIMA · Έλεγχος διεπαφής με συνθετικά δεδομένα</p><section className="visit-workspace"><PatientSession bundle={value} reload={reload} onFinalize={async()=>{}} finalizing={false} finalizeError="" selectedSessionId={sessionId} onSelectSession={()=>{}} contextReady reloadContext={reload}/></section></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
