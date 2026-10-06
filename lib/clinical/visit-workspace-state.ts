import type {DemoRisk, PatientBundle} from '../patients/demo-runtime';

function correctedSection(bundle:PatientBundle,section:PatientBundle['sections'][number]){
 let document=section.document;
 for(const correction of (bundle.corrections||[]).filter(item=>item.session_id===section.session_id).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))){
  const change=correction.patch?.[section.section_key];
  if(change&&change.after&&typeof change.after==='object'&&'kind' in change.after)document=change.after as typeof document;
 }
 return {...section,document};
}

export type WorkspaceTab='summary'|'sessions'|'history'|'medications'|'psychometrics';
export type WorkspaceHeroAction='resume'|'new_follow_up'|'none';
export function workspaceHeroAction(established:boolean,hasDraft:boolean,hasIntended:boolean):WorkspaceHeroAction{
 if(hasDraft||hasIntended)return 'resume';
 return established?'new_follow_up':'none';
}
export function workspaceTransitionSearch(search:string,tab:WorkspaceTab,sessionId?:string|null,options:{clearAppointment?:boolean}={}){
 const params=new URLSearchParams(search);
 if(tab==='summary')params.delete('tab');else params.set('tab',tab);
 if(tab==='sessions'&&sessionId)params.set('session',sessionId);else params.delete('session');
 if(options.clearAppointment)params.delete('appointment');
 const next=params.toString();return next?'?'+next:'';
}
// A visit response contains only that visit. Keep longitudinal context for scores
// and historical references, replacing matching records with the fresh response.
export function mergeVisitContext(visit:PatientBundle,context:PatientBundle|null):PatientBundle{
 if(!context)return visit;
 const merge=<T>(old:T[],fresh:T[],key:(row:T)=>string)=>[...old.filter(row=>!fresh.some(item=>key(item)===key(row))),...fresh];
 return {...context,sessions:merge(context.sessions,visit.sessions,s=>s.id),sections:merge(context.sections,visit.sections,s=>s.id),risks:merge(context.risks,visit.risks,r=>r.session_id),proposals:merge(context.proposals,visit.proposals,p=>p.id),addenda:merge(context.addenda,visit.addenda,a=>a.id),corrections:merge(context.corrections||[],visit.corrections||[],c=>c.id)};
}
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
 follow_up:[['interview','Συμπτώματα'],['adherence','Παρενέργειες / λήψη'],['mse','MSE αλλαγές'],['risk','Risk'],['psychometrics','Scores'],['medication','Αγωγή'],['assessment','Εκτίμηση'],['plan','Επανεκτίμηση']],
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
  const raw=bundle.sections.find(s=>s.session_id===session.id&&s.section_key==='mse'&&(s.content.trim()||s.document));
  if(raw){const section=correctedSection(bundle,raw);return {session,section,addenda:bundle.addenda.filter(a=>a.session_id===session.id)}};
 }
 return null;
}
