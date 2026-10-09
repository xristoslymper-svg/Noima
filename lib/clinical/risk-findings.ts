import type {DemoRisk} from '../patients/demo-runtime';
import {riskTreePath,riskTreeHidden,riskTreeQuestions,riskTreeLabel} from './risk-tree.ts';
export type RiskFinding={key:string;label:string;value:string;note?:string;previousBranch?:boolean};
export const riskStateLabel=(value?:string)=>({positive:'Θετικό',negative:'Αρνητικό',unknown:'Άγνωστο',not_assessed:'Δεν διερευνήθηκε'}[value||'']||'Μη διαθέσιμη απάντηση');
export function riskFindings(risk:Partial<DemoRisk>|null|undefined):RiskFinding[]{
 if(!risk)return [];
 const tree=risk.tree, hidden=tree?riskTreeHidden(tree):[];
 const findings:RiskFinding[]=tree?[...riskTreePath(tree.answers),'others',...hidden].map(key=>({key:'tree:'+key,label:riskTreeQuestions[key].title,value:tree.answers[key]||'unavailable',note:tree.notes[key],previousBranch:hidden.includes(key)})):[];
 const mappings={suicidal_ideation:'wish',intent:'intent',plan:'plan',harm_to_others:'others'} as const;
 for(const [key,label] of Object.entries({suicidal_ideation:'Αυτοκτονικός ιδεασμός',intent:'Πρόθεση',plan:'Σχέδιο',self_harm:tree?'Γενική καταγραφή αυτοτραυματισμού':'Αυτοτραυματισμός — γενική καταγραφή',attempt_history:'Ιστορικό απόπειρας',harm_to_others:'Κίνδυνος προς άλλους'})){
  const value=risk[key as keyof DemoRisk] as string|undefined;
  if(tree&&key in mappings){const answer=tree.answers[mappings[key as keyof typeof mappings]];if(answer===value||!value||value==='not_assessed')continue;}
  // A distinct legacy field never negates an explicit tree answer. Retain actual legacy findings.
  if(tree&&key==='self_harm'&&(!value||value==='not_assessed'||riskTreePath(tree.answers).some(k=>k==='selfacted'&&tree.answers[k]===value)))continue;
  findings.push({key,label,value:value||'unavailable'});
 }
 return findings;
}
export function riskFindingLabel(f:RiskFinding){return f.key.startsWith('tree:')?(f.value==='unavailable'?'Μη διαθέσιμη απάντηση':riskTreeLabel(f.key.slice(5),f.value)):riskStateLabel(f.value);}
export function riskHasConcern(risk:Partial<DemoRisk>|null|undefined){return riskFindings(risk).some(f=>!f.previousBranch&&['positive','active','both','passive'].includes(f.value));}
