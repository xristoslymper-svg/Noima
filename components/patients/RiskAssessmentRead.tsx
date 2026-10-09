import type {DemoRisk} from '@/lib/patients/demo-runtime';
import {riskFindings,riskFindingLabel} from '@/lib/clinical/risk-findings';
export default function RiskAssessmentRead({risk}:{risk:Partial<DemoRisk>|null|undefined}){
 return <div className="risk-assessment-read">{risk?<><ul>{riskFindings(risk).map(f=><li key={f.key}>{f.previousBranch&&<small>Προηγούμενος κλάδος · προς επανέλεγχο<br/></small>}{f.label}<br/><strong>{riskFindingLabel(f)}</strong>{f.note&&<p>{f.note}</p>}</li>)}</ul>{risk.protective_factors&&<p>Προστατευτικοί παράγοντες: {risk.protective_factors}</p>}{risk.clinical_note&&<p>Κλινική αποτίμηση & ενέργειες: {risk.clinical_note}</p>}</>:<p>Δεν υπάρχει διαθέσιμη σημερινή εκτίμηση.</p>}</div>;
}
