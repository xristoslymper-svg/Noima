export type OverviewPsychometric={id:string;patient_id:string;patient_name:string;instrument:string;status:string;score:number|null;completed_at:string|null;created_at:string;reviewed_at:string|null;item9_review:boolean;item9_reviewed_at:string|null;intake_id:string|null;provenance:string|null};
export type OverviewIntake={id:string;patient_id:string|null;patient_name:string;tools:string[];channel:string;status:'submitted'|'conflict';submitted_at:string|null;created_at:string};
export type ReviewSubmission={key:string;intake_id:string|null;patient_id:string|null;patient_name:string;tools:string[];channel:string;status:'ready'|'conflict';when:string;has_history:boolean;psychometrics:string[]};

export const reviewChannelLabel=(channel:string,provenance='')=>['Tablet','Email','Έντυπο','Σύνδεσμος'].includes(channel)?channel:channel==='tablet'||provenance.includes('patient_intake:tablet')?'Tablet':channel==='email'||provenance.includes('patient_intake:email')?'Email':channel==='print'||channel==='scanned_paper'||provenance.includes('patient_intake:print')||provenance.includes('patient_intake:scanned_paper')?'Έντυπο':provenance.includes('patient_link')?'Σύνδεσμος':'Noima';

export function groupPatientSubmissions(intakes:OverviewIntake[],assessments:OverviewPsychometric[]):ReviewSubmission[]{
 const groups=new Map<string,ReviewSubmission>();
 const addTool=(group:ReviewSubmission,tool:string)=>{if(!group.tools.includes(tool))group.tools.push(tool);if(tool==='history')group.has_history=true;else if(!group.psychometrics.includes(tool))group.psychometrics.push(tool)};
 for(const intake of intakes){
  const group:ReviewSubmission={key:'intake:'+intake.id,intake_id:intake.id,patient_id:intake.patient_id,patient_name:intake.patient_name,tools:[],channel:intake.channel,status:intake.status==='conflict'?'conflict':'ready',when:intake.submitted_at||intake.created_at,has_history:false,psychometrics:[]};
  // Only pending instruments belong in the inbox. A history-containing intake
  // can remain pending after its psychometrics have already been reviewed.
  if(intake.status==='conflict')intake.tools.forEach(tool=>addTool(group,tool));
  else if(intake.tools.includes('history'))addTool(group,'history');
  groups.set(group.key,group);
 }
 for(const assessment of assessments){
  if(assessment.status!=='completed'||(assessment.reviewed_at&&(!assessment.item9_review||assessment.item9_reviewed_at)))continue;
  const key=assessment.intake_id?'intake:'+assessment.intake_id:'assessment:'+assessment.id;
  const existing=groups.get(key);
  const group=existing||{key,intake_id:assessment.intake_id,patient_id:assessment.patient_id,patient_name:assessment.patient_name,tools:[],channel:reviewChannelLabel('',assessment.provenance||''),status:'ready' as const,when:assessment.completed_at||assessment.created_at,has_history:false,psychometrics:[]};
  addTool(group,assessment.instrument);group.patient_id=group.patient_id||assessment.patient_id;group.patient_name=group.patient_name||assessment.patient_name;
  if(!existing)groups.set(key,group);
  if(Date.parse(assessment.completed_at||assessment.created_at)>Date.parse(group.when))group.when=assessment.completed_at||assessment.created_at;
 }
 return [...groups.values()].sort((a,b)=>Date.parse(b.when)-Date.parse(a.when));
}
