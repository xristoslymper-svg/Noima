import type {DemoRisk, PatientBundle} from '../patients/demo-runtime';

export type WorkspaceTab='summary'|'sessions'|'history'|'medications'|'psychometrics';
const tabs:WorkspaceTab[]=['summary','sessions','history','medications','psychometrics'];
export function workspaceLocation(search:string){
 const params=new URLSearchParams(search),requested=params.get('tab');
 const tab:WorkspaceTab=tabs.includes(requested as WorkspaceTab)?requested as WorkspaceTab:(!requested&&params.get('session')?'sessions':'summary');
 return {tab,sessionId:tab==='sessions'?params.get('session'):null};
}
export function hasCompletedClinicalHistory(bundle:Pick<PatientBundle,'sessions'>){
 return bundle.sessions.some(s=>s.status==='completed');
}
export const riskChoices=[['not_assessed','Δεν διερευνήθηκε','—'],['unknown','Άγνωστο','Άγνωστο'],['negative','Αρνητικό','Όχι'],['positive','Θετικό','Ναι']] as const;
export const visitSteps={
 initial_assessment:[['interview','Λόγος'],['mse','MSE'],['risk','Risk'],['history','Ιστορικό'],['assessment','Αξιολόγηση'],['medication','Αγωγή'],['plan','Πλάνο']],
 follow_up:[['interview','Πορεία'],['mse','MSE'],['risk','Risk'],['psychometrics','Scores'],['adherence','Λήψη / παρενέργειες'],['medication','Αγωγή'],['assessment','Αξιολόγηση'],['plan','Πλάνο']],
} as const;
// Use all measured section positions, including long sections spanning the viewport.
export function activeVisitPart(parts:{key:string;top:number}[],readingLine:number){
 return parts.filter(p=>p.top<=readingLine+1).at(-1)?.key||parts[0]?.key||'interview';
}
const requiredSections=[['interview','Ψυχιατρική συνέντευξη'],['mse','MSE'],['assessment','Κλινική αξιολόγηση'],['plan','Θεραπευτικό πλάνο'],['review','Επανεκτίμηση']] as const;
export function finalizationBlocker(sections:{section_key:string;content:string}[],risk?:DemoRisk){
 if(!risk||risk.suicidal_ideation==='not_assessed')return {anchor:'risk',message:'Χρειάζεται εκτίμηση κινδύνου πριν ολοκληρωθεί η επίσκεψη.'};
 if(risk.suicidal_ideation==='positive'&&[risk.intent,risk.plan,risk.self_harm,risk.attempt_history].some(v=>v==='not_assessed'))return {anchor:'risk',message:'Με θετικό ιδεασμό, συμπληρώστε Πρόθεση, Σχέδιο, Αυτοτραυματισμό και Ιστορικό απόπειρας.'};
 const missing=requiredSections.find(([key])=>!sections.some(s=>s.section_key===key&&s.content.trim()));
 return missing?{anchor:missing[0]==='review'?'plan':missing[0],message:'Χρειάζεται καταγραφή: '+missing[1]+'.'}:null;
}
export function previousMseReference(bundle:PatientBundle|null,sessionId:string,startedAt:string){
 if(!bundle)return null;
 const prior=bundle.sessions.filter(s=>s.id!==sessionId&&s.status==='completed'&&Date.parse(s.completed_at||s.started_at)<=Date.parse(startedAt)).sort((a,b)=>Date.parse(b.completed_at||b.started_at)-Date.parse(a.completed_at||a.started_at));
 for(const session of prior){
  const section=bundle.sections.find(s=>s.session_id===session.id&&s.section_key==='mse'&&s.content.trim());
  if(section)return {session,section,addenda:bundle.addenda.filter(a=>a.session_id===session.id)};
 }
 return null;
}
