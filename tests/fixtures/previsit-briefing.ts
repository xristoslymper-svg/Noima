// Fictional records only, shared by the data and browser regressions.
import type {PatientBundle} from '../../lib/patients/demo-runtime';
export function previsitFixture(scenario='negative'):PatientBundle{
 const p='40000000-0000-4000-8000-000000000098',s='50000000-0000-4000-8000-000000000098',old='50000000-0000-4000-8000-000000000097',draft='50000000-0000-4000-8000-000000000099';
 const date='2026-10-10T09:00:00Z';
 const risk={session_id:s,patient_id:p,suicidal_ideation:'negative',intent:'negative',plan:'negative',self_harm:'negative',attempt_history:'negative',harm_to_others:'negative',protective_factors:'',clinical_note:'Χωρίς νέα ένδειξη αυτοκτονικού ή ετεροκαταστροφικού κινδύνου.',version:1,updated_at:date};
 const b={patient:{id:p,first_name:'Συνθετικός',last_name:'Ασθενής',chief_complaint:'',note:'ADMINISTRATIVE_ONLY',reported_age:36},sessions:[{id:s,patient_id:p,status:'completed',session_type:'follow_up',started_at:date,completed_at:date,updated_at:date},{id:old,patient_id:p,status:'completed',session_type:'initial_assessment',started_at:'2026-09-25T09:00:00Z',completed_at:'2026-09-25T10:00:00Z'},{id:draft,patient_id:p,status:'draft',session_type:'follow_up',started_at:'2026-10-11T09:00:00Z'}],sections:[
 {id:'diagnosis',session_id:s,patient_id:p,section_key:'assessment',content:'Καταγεγραμμένη διαγνωστική υπόθεση.',document:{kind:'assessment',fields:[{key:'diagnosis',label:'Diagnosis',text:'Γενικευμένη αγχώδης διαταραχή',status:'provisional',codes:[{code:'F41.1',label:'Γενικευμένη αγχώδης διαταραχή',system:'WHO ICD-10',edition:'2019'}]},{key:'differential-1',label:'Differential Diagnosis',text:'Διαταραχή προσαρμογής',status:'under_investigation'}]}},
 {id:'report',session_id:s,patient_id:p,section_key:'interview',content:'Ο ασθενής αναφέρει λιγότερο άγχος πριν από επαγγελματικές παρουσιάσεις. Αναφέρει ύπνο 6–7 ωρών.'},
 {id:'old-report',session_id:old,patient_id:p,section_key:'interview',content:'Ο ασθενής αναφέρει δυσκολία στην έναρξη του ύπνου.'},
 {id:'mse',session_id:s,patient_id:p,section_key:'mse',content:'Καταγεγραμμένα ευρήματα ψυχικής κατάστασης.',document:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Υποκειμενικό συναίσθημα: Ευθυμικό',review:'changed'},{key:'speech',label:'Speech',text:'Λόγος συγκροτημένος.',review:'unchanged'},{key:'perception',label:'Perception',text:'',review:'not_assessed'}]}},
 {id:'old-mse',session_id:old,patient_id:p,section_key:'mse',content:'Προηγούμενα ευρήματα.',document:{kind:'mse',fields:[{key:'mood',label:'Mood',text:'Υποκειμενικό συναίσθημα: Αγχώδες',review:'changed'},{key:'perception',label:'Perception',text:'Παλαιότερη καταγραφή αντίληψης.'}]}},
 {id:'plan',session_id:s,patient_id:p,section_key:'review',content:'Επανεξέταση σε δύο εβδομάδες.'},
 {id:'draft-report',session_id:draft,patient_id:p,section_key:'interview',content:'SECRET_DRAFT_NEVER_DISPLAY'}
 ],risks:[risk],history:null,medications:[{id:'med',medication_name:'Sertraline',status:'active',dose:50,unit:'mg',frequency:'πρωί'},{id:'stopped',medication_name:'STOPPED_MED',status:'stopped',dose:10,unit:'mg',frequency:'βράδυ'},{id:'future',medication_name:'FUTURE_MED',status:'planned',dose:20,unit:'mg',frequency:'πρωί'}],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[],addenda:[],corrections:[],assessments:[],appointments:[]} as unknown as PatientBundle;
 if(scenario==='positive'){b.risks[0]={...risk,suicidal_ideation:'positive',intent:'positive',clinical_note:'Συνθετική καταγραφή ενεργών σκέψεων, προς κλινική εκτίμηση.'};}
 if(scenario==='unknown')b.risks[0].suicidal_ideation='unknown';
 if(scenario==='not_assessed')b.risks[0].suicidal_ideation='not_assessed';
 if(scenario==='missing')b.risks=[];
 if(scenario==='conflict')b.sections.find(r=>r.id==='report')!.content='Ο ασθενής αναφέρει αυτοκτονικές σκέψεις.';
 if(scenario==='empty'){b.sessions=b.sessions.filter(s=>s.status==='draft');b.sections=b.sections.filter(s=>s.id==='draft-report');b.risks=[];b.medications=[];}
 if(scenario==='old-mse')b.sections=b.sections.filter(s=>s.id!=='mse');
 return b;
}
