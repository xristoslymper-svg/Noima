import type {PatientBundle} from '@/lib/patients/demo-runtime';

export const sectionNames:Record<string,string>={interview:'Συμπτώματα / συνέντευξη',functioning:'Λειτουργικότητα',effects:'Παρενέργειες',adherence:'Συμμόρφωση',mse:'MSE',assessment:'Κλινική εκτίμηση',plan:'Πλάνο',review:'Επανεκτίμηση'};

export function documentedChanges(bundle:PatientBundle){
 const sessions=bundle.sessions.filter(s=>s.status==='completed').sort((a,b)=>Date.parse(b.completed_at!)-Date.parse(a.completed_at!));const [latest,previous]=sessions;
 if(!latest||!previous)return [];
 const changes:{label:string;before:string;after:string;beforeId:string;afterId:string}[]=[];
 for(const [key,label] of Object.entries(sectionNames)){
  const before=bundle.sections.find(s=>s.session_id===previous.id&&s.section_key===key)?.content.trim()||'';
  const after=bundle.sections.find(s=>s.session_id===latest.id&&s.section_key===key)?.content.trim()||'';
  if(before!==after)changes.push({label,before:before||'Δεν καταγράφηκε',after:after||'Δεν καταγράφηκε',beforeId:previous.id,afterId:latest.id});
 }
 const labels:Record<string,string>={not_assessed:'Δεν διερευνήθηκε',unknown:'Άγνωστο',negative:'Αρνητικό',positive:'Θετικό'};
 const br=bundle.risks.find(r=>r.session_id===previous.id),ar=bundle.risks.find(r=>r.session_id===latest.id);
 for(const [key,label] of [['suicidal_ideation','Αυτοκτονικός ιδεασμός'],['intent','Πρόθεση'],['plan','Σχέδιο'],['self_harm','Αυτοτραυματισμός'],['attempt_history','Ιστορικό απόπειρας'],['protective_factors','Προστατευτικοί παράγοντες'],['clinical_note','Σημείωση κινδύνου']]){
  const b=br?.[key as keyof typeof br],a=ar?.[key as keyof typeof ar];if(a!==b)changes.push({label,before:labels[String(b)]||String(b||'Δεν καταγράφηκε'),after:labels[String(a)]||String(a||'Δεν καταγράφηκε'),beforeId:previous.id,afterId:latest.id});
 }
 return changes;
}

export type SummarySource='session'|'medications'|'psychometrics'|'history';
export type SummaryFinding={key:string;label:string;text:string;source:SummarySource;sessionId?:string;attention?:boolean};

const clean=(value?:string|null)=>value?.trim()||'';
const riskLabel:Record<string,string>={not_assessed:'δεν διερευνήθηκε',unknown:'άγνωστο',negative:'αρνητικός',positive:'θετικός'};

export function clinicalSummaryFindings(bundle:PatientBundle):SummaryFinding[]{
 const completed=[...bundle.sessions].filter(s=>s.status==='completed').sort((a,b)=>Date.parse(b.completed_at!)-Date.parse(a.completed_at!));
 const latest=completed[0];
 const previous=completed[1];
 const section=(sessionId:string|undefined,key:string)=>clean(bundle.sections.find(s=>s.session_id===sessionId&&s.section_key===key)?.content);
 const findings:SummaryFinding[]=[];

 if(latest){
  const assessment=section(latest.id,'assessment')||section(latest.id,'interview');
  if(assessment)findings.push({key:'picture',label:'Τρέχουσα εικόνα',text:assessment,source:'session',sessionId:latest.id});

  if(previous){
   const changedKeys=['assessment','interview','functioning','mse'] as const;
   const changed=changedKeys.map(key=>({key,before:section(previous.id,key),after:section(latest.id,key)})).find(item=>item.after&&item.after!==item.before);
   if(changed)findings.push({key:'course',label:'Πορεία',text:changed.after,source:'session',sessionId:latest.id});
  }

  const risk=bundle.risks.find(r=>r.session_id===latest.id);
  if(risk){
   const parts=[`Αυτοκτονικός ιδεασμός: ${riskLabel[risk.suicidal_ideation]||risk.suicidal_ideation}`];
   if(risk.suicidal_ideation==='positive'){
    parts.push(`πρόθεση: ${riskLabel[risk.intent]||risk.intent}`,`σχέδιο: ${riskLabel[risk.plan]||risk.plan}`);
   }
   if(clean(risk.clinical_note))parts.push(risk.clinical_note);
   findings.push({key:'risk',label:'Κίνδυνος',text:parts.join(' · '),source:'session',sessionId:latest.id,attention:risk.suicidal_ideation==='positive'});
  }
 }

 const active=bundle.medications.filter(m=>m.status==='active');
 const unresolved=bundle.medicationSideEffects.filter(e=>!e.resolved_on);
 if(active.length||unresolved.length){
  const meds=active.map(m=>`${m.medication_name} ${m.dose} ${m.unit} · ${m.frequency}`);
  const effects=unresolved.slice(0,2).map(e=>`${bundle.medications.find(m=>m.id===e.medication_id)?.medication_name||'Αγωγή'}: ${e.effect_text}${e.severity?` (${e.severity})`:''}`);
  findings.push({key:'meds',label:'Αγωγή',text:[meds.join(' · '),effects.length?`Ανεπίλυτες παρενέργειες: ${effects.join(' · ')}`:''].filter(Boolean).join(' — '),source:'medications',attention:unresolved.some(e=>e.severity==='severe')});
 }

 const recentAssessments=(['PHQ-9','GAD-7'] as const).map(instrument=>[...bundle.assessments].filter(a=>a.instrument===instrument&&a.status==='completed').sort((a,b)=>Date.parse(b.completed_at||b.created_at)-Date.parse(a.completed_at||a.created_at))[0]).filter(Boolean);
 if(recentAssessments.length){
  findings.push({key:'psychometrics',label:'Ψυχομετρικά',text:recentAssessments.map(a=>`${a!.instrument}: ${a!.score}${a!.item9_review&&!a!.item9_reviewed_at?' · λήμμα 9 προς έλεγχο':''}`).join(' · '),source:'psychometrics',attention:recentAssessments.some(a=>Boolean(a?.item9_review&&!a?.item9_reviewed_at))});
 }

 if(latest){
  const plan=section(latest.id,'plan');
  const review=section(latest.id,'review');
  if(plan||review)findings.push({key:'plan',label:'Πλάνο',text:[plan,review].filter(Boolean).join(' · '),source:'session',sessionId:latest.id});
 }
 return findings;
}
