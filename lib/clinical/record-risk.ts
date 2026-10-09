import type {DemoRisk} from '../patients/demo-runtime';
import {riskFindings,riskFindingLabel,riskStateLabel} from './risk-findings.ts';

/** Labels follow the question actually stored; a death-wish answer is not a global SI assessment. */
export function recordRisk(risk:DemoRisk|null|undefined){
 if(!risk)return null;
 const findings=riskFindings(risk);
 const primary=risk.tree?findings.find(f=>f.key==='tree:wish'):findings.find(f=>f.key==='suicidal_ideation');
 return {
  primary:primary?`${primary.label} ${riskFindingLabel(primary)}`:'Δεν υπάρχει διαθέσιμη απάντηση.',
  domains:findings.filter(f=>f!==primary).map(f=>({
   key:f.key,text:`${f.previousBranch?'Προηγούμενη διαδρομή ερωτήσεων · ':''}${f.label}: ${riskFindingLabel(f)}`,
   note:f.note||'',
  })),
  primaryNote:primary?.note||'',note:risk.clinical_note||'',protectiveFactors:risk.protective_factors||'',
  // The conditional tree may not ask ideation/intent/plan at all. State that
  // explicitly rather than deriving negative answers from a negative wish.
  unassessed:risk.tree?['ideation','intent','plan'].filter(k=>!findings.some(f=>f.key==='tree:'+k&&!f.previousBranch)).map(k=>
   ({ideation:'Αυτοκτονικές σκέψεις',intent:'Πρόθεση',plan:'Σχέδιο'}[k])+': '+riskStateLabel('not_assessed')):[],
 };
}
