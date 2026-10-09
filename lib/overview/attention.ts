import type {ClinicalCard} from '../clinical/clinical-card';
import type {Finding} from '../clinical/summary-context';
import type {DemoRisk} from '../patients/demo-runtime';
import {riskFindings} from '../clinical/risk-findings.ts';

export function overviewAttention(card: Pick<ClinicalCard, 'alerts' | 'sources'>) {
  const groups: Record<'concern'|'review'|'incomplete'|'history', Finding[]> = {concern:[],review:[],incomplete:[],history:[]};
  for (const finding of card.alerts) {
    if (finding.key === 'risk-missing') groups.incomplete.push(finding);
    else if (finding.key === 'risk') {
      // Sources already contain effective corrections. Never infer meaning from prose.
      const source=card.sources.find(s=>finding.source_ids.includes(s.id)&&s.kind==='structured_risk');
      if (!source || !source.content || typeof source.content!=='object') {groups.review.push(finding);continue;}
      const fields=riskFindings(source.content as Partial<DemoRisk>);
      const positive=(value:string)=>['positive','active','both','passive'].includes(value);
      if(fields.some(f=>!f.previousBranch&&f.key!=='attempt_history'&&positive(f.value))) groups.concern.push(finding);
      else if(fields.some(f=>!f.previousBranch&&['unknown','not_assessed','unavailable'].includes(f.value))) groups.incomplete.push(finding);
      else if(fields.some(f=>f.previousBranch||f.key==='attempt_history'&&positive(f.value))) groups.history.push(finding);
      else groups.review.push(finding);
    } else if (finding.label==='Σημαντικό ιστορικό') groups.history.push(finding);
    else if (finding.key.startsWith('effect:') && card.sources.some(s=>finding.source_ids.includes(s.id)&&s.kind==='structured_side_effect'&&s.content&&typeof s.content==='object'&&'severity' in s.content&&s.content.severity==='severe')) groups.concern.push(finding);
    // Narrative notes, screening flags and unfamiliar findings retain prominence;
    // none is promoted to a confirmed concern or dismissed as a negative finding.
    else groups.review.push(finding);
  }
  return groups;
}
