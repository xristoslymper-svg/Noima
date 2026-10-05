import type {Evidence,Finding} from './summary-context';

export function summaryDisplayState(
  cachedFindings:Finding[]|null,
  cachedSources:Evidence[]|null,
  canonicalFindings:Finding[],
  currentSources:Evidence[],
  stale:boolean,
){
  if(!cachedFindings||!cachedSources)return {findings:canonicalFindings,freshCritical:[] as Finding[],sources:currentSources};
  if(!stale)return {findings:cachedFindings,freshCritical:[] as Finding[],sources:cachedSources};
  const freshCritical=canonicalFindings.filter(finding=>finding.attention);
  const findings=cachedFindings.filter(finding=>finding.origin==='synthesis');
  const currentIds=new Set(currentSources.map(source=>source.id));
  const sources=[...currentSources,...cachedSources.filter(source=>!currentIds.has(source.id))];
  return {findings,freshCritical,sources};
}
