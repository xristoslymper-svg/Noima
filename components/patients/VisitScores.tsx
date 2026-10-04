'use client';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import {visitScoreComparisons} from '@/lib/clinical/visit-scores';
import {formatClinicDate} from '@/lib/clinic-time';
import PatientPsychometrics from './PatientPsychometrics';
export default function VisitScores({bundle,sessionId,reload}:{bundle:PatientBundle;sessionId:string;reload:()=>Promise<unknown>}){
 const comparisons=visitScoreComparisons(bundle,sessionId);
 return <div className="visit-scores"><div className="clinical-table-wrap"><table className="clinical-lean-table score-comparison"><caption>Scores έναντι προηγούμενης επίσκεψης</caption><thead><tr><th>Εργαλείο</th><th>Προηγούμενη επίσκεψη</th><th>Αυτή η επίσκεψη</th><th>Μεταβολή</th></tr></thead><tbody>{comparisons.map(c=><tr key={c.instrument}><th scope="row">{c.instrument}</th><td>{c.prior?<><strong>{c.prior.score}</strong><small>{formatClinicDate(c.prior.completed_at!)}</small></>:<small>{c.previous?'Δεν υπάρχει συνδεδεμένη μέτρηση':'Δεν υπάρχει προηγούμενη επίσκεψη'}</small>}</td><td>{c.current?<><strong>{c.current.score}</strong><small>{formatClinicDate(c.current.completed_at!)}</small></>:<small>Δεν υπάρχει συνδεδεμένη μέτρηση</small>}</td><td>{c.delta!==null?<strong>{c.delta>0?'+':''}{c.delta}</strong>:<small>{c.current&&c.prior?'Διαφορετικές εκδόσεις εργαλείου':'—'}</small>}</td></tr>)}</tbody></table></div><details className="visit-score-history"><summary>Αναθέσεις & πλήρες ιστορικό μετρήσεων</summary><PatientPsychometrics bundle={bundle} reload={reload} sessionId={sessionId}/></details></div>;
}
