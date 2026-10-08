import type {DemoRisk, PatientBundle} from '../patients/demo-runtime';
import type {VisitDocument} from './visit-document';

function documentText(document:NonNullable<PatientBundle['sections'][number]['document']>){
 return document.fields.flatMap(field=>{
  const body=field.text.trim();
  const codes=(field.codes||[]).map(code=>code.code+' · '+code.label+' (WHO ICD-10 2019)').join('; ');
  if(!body&&!codes)return [];
  const status=field.status==='provisional'?' — προσωρινή':field.status==='under_investigation'?' — υπό διερεύνηση':field.status==='confirmed'?' — επιβεβαιωμένη':'';
  return [field.label+status+': '+body+(codes?'\n'+codes:'')];
 }).join('\n\n');
}
function correctedSection(bundle:PatientBundle,section:PatientBundle['sections'][number]){
 let document=section.document,content=section.content;
 for(const correction of (bundle.corrections||[]).filter(item=>item.session_id===section.session_id).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id))){
  const change=correction.patch?.[section.section_key];
  if(typeof change?.after==='string'){document=null;content=change.after}
  if(change&&change.after&&typeof change.after==='object'&&'kind' in change.after){document=change.after as typeof document;if(document)content=documentText(document)}
 }
 return {...section,document,content};
}

type MseTimelineField={key:string;label:string;state:'first'|'same'|'changed'|'not_assessed'|'missing';before:string;text:string};
export function mseTimeline(bundle:PatientBundle,sessionId:string,startedAt:string){
 const current=bundle.sessions.find(s=>s.id===sessionId);
 const time=Date.parse(current?sessionClinicalTime(bundle,current):startedAt);
 const sessions=bundle.sessions.filter(s=>s.id!==sessionId&&s.status==='completed'&&Date.parse(sessionClinicalTime(bundle,s))<time).sort((a,b)=>Date.parse(sessionClinicalTime(bundle,a))-Date.parse(sessionClinicalTime(bundle,b))||a.id.localeCompare(b.id));
 const references:Record<string,{field:VisitDocument['fields'][number];sessionId:string;date:string;older:boolean}>={};
 const visits=sessions.map((session,index)=>{
  const raw=bundle.sections.find(s=>s.session_id===session.id&&s.section_key==='mse');
  const section=raw?correctedSection(bundle,raw):null;
  const date=sessionClinicalTime(bundle,session);
  const corrections=(bundle.corrections||[]).filter(c=>c.session_id===session.id);
  const addenda=bundle.addenda.filter(a=>a.session_id===session.id);
  const keys=new Set([...Object.keys(references),...(section?.document?.fields.map(f=>f.key)||[])]);
  const fields=[...keys].filter(key=>key!=='legacy').flatMap<MseTimelineField>(key=>{
   const field=section?.document?.fields.find(f=>f.key===key);
   const previous=references[key];
   if(!field?.text.trim()||field.review==='not_assessed')return previous||field?.review==='not_assessed'?[{key,label:field?.label||previous.field.label,state:field?.review==='not_assessed'?'not_assessed' as const:'missing' as const,before:previous?.field.text||'',text:''}]:[];
   const state=!previous?'first' as const:previous.field.text===field.text?'same' as const:'changed' as const;
   references[key]={field,sessionId:session.id,date,older:index!==sessions.length-1};
   return [{key,label:field.label,state,before:previous?.field.text||'',text:field.text}];
  });
  return {sessionId:session.id,date,fields,narrative:section&&!section.document?section.content:section?.document?.fields.find(f=>f.key==='legacy')?.text||'',corrections,addenda};
 });
 return {visits,references};
}

export type WorkspaceTab='summary'|'timeline'|'treatment'|'history';
type LegacyWorkspaceTab='sessions'|'medications'|'psychometrics';
function canonicalTab(tab:WorkspaceTab|LegacyWorkspaceTab):WorkspaceTab{
 return tab==='sessions'?'timeline':tab==='medications'||tab==='psychometrics'?'treatment':tab;
}
export type WorkspaceHeroAction='resume'|'new_initial'|'new_follow_up';
export function workspaceHeroAction(established:boolean,hasDraft:boolean,hasIntended:boolean):WorkspaceHeroAction{
 if(hasDraft||hasIntended)return 'resume';
 return established?'new_follow_up':'new_initial';
}
export function workspaceTransitionSearch(search:string,tab:WorkspaceTab|LegacyWorkspaceTab,sessionId?:string|null,options:{clearAppointment?:boolean}={}){
 const params=new URLSearchParams(search);
 const destination=canonicalTab(tab);
 if(destination==='summary')params.delete('tab');else params.set('tab',destination);
 if(destination==='timeline'&&sessionId)params.set('session',sessionId);else params.delete('session');
 if(tab==='psychometrics')params.set('section','measurements');else params.delete('section');
 params.delete('assessment');
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
const tabs=['summary','timeline','treatment','history','sessions','medications','psychometrics'];
export function workspaceLocation(search:string){
 const params=new URLSearchParams(search),requested=params.get('tab');
 const tab:WorkspaceTab=requested&&tabs.includes(requested)?canonicalTab(requested as WorkspaceTab|LegacyWorkspaceTab):(!requested&&params.get('session')?'timeline':'summary');
 return {tab,sessionId:tab==='timeline'?params.get('session'):null};
}
export function workspaceMeasurementsRequested(search:string){
 const params=new URLSearchParams(search);
 return params.get('tab')==='psychometrics'||(params.get('tab')==='treatment'&&params.get('section')==='measurements');
}
export function workspaceSelectedAssessment(search:string){
 return workspaceMeasurementsRequested(search)?new URLSearchParams(search).get('assessment'):null;
}
export function workspaceMeasurementSearch(search:string,assessmentId?:string|null){
 const params=new URLSearchParams(workspaceTransitionSearch(search,'psychometrics'));
 if(assessmentId)params.set('assessment',assessmentId);
 return '?'+params.toString();
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
export function finalizationBlocker(sections:{section_key:string;content:string;document?:VisitDocument|null}[],risk?:DemoRisk,previousMse?:VisitDocument|null){
 if(!risk||risk.suicidal_ideation==='not_assessed')return {anchor:'risk',message:'Χρειάζεται εκτίμηση κινδύνου πριν ολοκληρωθεί η καταγραφή.'};
 if(risk.suicidal_ideation==='positive'&&[risk.intent,risk.plan,risk.self_harm,risk.attempt_history].some(v=>v==='not_assessed'))return {anchor:'risk',message:'Με θετικό ιδεασμό, συμπληρώστε Πρόθεση, Σχέδιο, Αυτοτραυματισμό και Ιστορικό απόπειρας.'};
 const currentMse=sections.find(s=>s.section_key==='mse');
 if(previousMse&&currentMse?.document){
  const pending=previousMse.fields.filter(old=>old.key!=='legacy'&&old.text.trim()&&!currentMse.document?.fields.some(f=>f.key===old.key&&(f.review||f.text.trim())));
  if(pending.length)return {anchor:'mse',message:`Υπάρχουν ${pending.length} ενότητες MSE με προηγούμενες επιλογές που δεν ελέγχθηκαν σήμερα. Διατηρήστε, αλλάξτε ή σημειώστε «Δεν αξιολογήθηκε σήμερα».`};
 }
 const missing=requiredSections.find(([key])=>!sections.some(s=>s.section_key===key&&s.content.trim()));
 return missing?{anchor:missing[0]==='review'?'plan':missing[0],message:'Χρειάζεται καταγραφή: '+missing[1]+'.'}:null;
}
export function sessionClinicalTime(bundle:Pick<PatientBundle,'appointments'>,session:{id:string;started_at:string}){
 const appointment=bundle.appointments?.find(item=>item.session_id===session.id);
 return appointment?.scheduled_start||session.started_at;
}
export function previousMseReference(bundle:PatientBundle|null,sessionId:string,startedAt:string){
 if(!bundle)return null;
 const current=bundle.sessions.find(s=>s.id===sessionId);
 const currentTime=Date.parse(current?sessionClinicalTime(bundle,current):startedAt);
 const prior=bundle.sessions.filter(s=>s.id!==sessionId&&s.status==='completed'&&Date.parse(sessionClinicalTime(bundle,s))<currentTime).sort((a,b)=>Date.parse(sessionClinicalTime(bundle,b))-Date.parse(sessionClinicalTime(bundle,a)));
 const session=prior[0];if(!session)return null;
 const raw=bundle.sections.find(s=>s.session_id===session.id&&s.section_key==='mse'&&(s.content.trim()||s.document));
 if(!raw)return null;
 const section=correctedSection(bundle,raw);
 return {session,section,addenda:bundle.addenda.filter(a=>a.session_id===session.id)};
}
