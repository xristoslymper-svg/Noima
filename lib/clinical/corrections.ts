import type {StructuredCorrection} from './core-types';
import type {DemoRisk,DemoSection} from '../patients/demo-runtime';
import type {VisitDocument} from './visit-document';

export function correctionsFor(corrections:StructuredCorrection[]|undefined,sessionId:string){
 return (corrections||[]).filter(item=>item.session_id===sessionId).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
}
function latestAfter(corrections:StructuredCorrection[]|undefined,sessionId:string,key:string){
 let value:unknown=undefined;
 for(const item of correctionsFor(corrections,sessionId)){
  const change=item.patch?.[key];
  if(change&&Object.prototype.hasOwnProperty.call(change,'after'))value=change.after;
 }
 return value;
}
export function effectiveText(section:DemoSection|undefined,corrections:StructuredCorrection[]|undefined,sessionId:string,key:string){
 const after=latestAfter(corrections,sessionId,key);
 return typeof after==='string'?after:(section?.content||'');
}
export function effectiveDocument(section:DemoSection|undefined,corrections:StructuredCorrection[]|undefined,sessionId:string,key:'mse'|'assessment'){
 const after=latestAfter(corrections,sessionId,key);
 if(after&&typeof after==='object'&&'kind' in after&&((after as VisitDocument).kind===key))return after as VisitDocument;
 return section?.document||null;
}
export function effectiveSection(section:DemoSection,corrections:StructuredCorrection[]|undefined):DemoSection{
 const key=section.section_key;
 if(key==='mse'||key==='assessment'){
  const document=effectiveDocument(section,corrections,section.session_id,key);
  return {...section,document};
 }
 return {...section,content:effectiveText(section,corrections,section.session_id,key)};
}
export function effectiveRisk(risk:DemoRisk|undefined,corrections:StructuredCorrection[]|undefined,sessionId:string):DemoRisk|undefined{
 const after=latestAfter(corrections,sessionId,'risk');
 let value=after&&typeof after==='object'?{...(risk||{session_id:sessionId,patient_id:'',suicidal_ideation:'not_assessed',intent:'not_assessed',plan:'not_assessed',self_harm:'not_assessed',attempt_history:'not_assessed',protective_factors:'',clinical_note:'',version:0,updated_at:''}),...(after as Partial<DemoRisk>)}:risk;
 if(value?.tree){
  const answers={...value.tree.answers,wish:value.suicidal_ideation,intent:value.intent,plan:value.plan,others:value.harm_to_others||'not_assessed'};
  value={...value,tree:{...value.tree,answers}};
 }
 return value;
}
