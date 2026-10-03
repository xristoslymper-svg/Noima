import type {PatientBundle} from '@/lib/patients/demo-runtime';

export const sectionNames:Record<string,string>={interview:'Συμπτώματα / συνέντευξη',functioning:'Λειτουργικότητα',effects:'Παρενέργειες',adherence:'Συμμόρφωση',mse:'MSE',assessment:'Κλινική εκτίμηση',plan:'Πλάνο',review:'Επανεκτίμηση'};

export function documentedChanges(bundle:PatientBundle){
 const sessions=bundle.sessions.filter(s=>s.status==='completed').sort((a,b)=>Date.parse(b.completed_at!)-Date.parse(a.completed_at!));const [latest,previous]=sessions;
 if(!latest||!previous)return [];
 const changes:{label:string;before:string;after:string;beforeId:string;afterId:string}[]=[];
 for(const [key,label] of Object.entries(sectionNames)){
  const before=bundle.sections.find(s=>s.session_id===previous.id&&s.section_key===key)?.content.trim()||'';
  const after=bundle.sections.find(s=>s.session_id===latest.id&&s.section_key===key)?.content.trim()||'';
  if(before!==after)changes.push({label,before:before||'Δεν καταγράφηκε',after:after||'Δεν καταγράφηκε',beforeId:previous.id,afterId:latest.id});
 }
 const labels:Record<string,string>={not_assessed:'Δεν διερευνήθηκε',unknown:'Άγνωστο',negative:'Αρνητικό',positive:'Θετικό'};
 const br=bundle.risks.find(r=>r.session_id===previous.id),ar=bundle.risks.find(r=>r.session_id===latest.id);
 for(const [key,label] of [['suicidal_ideation','Αυτοκτονικός ιδεασμός'],['intent','Πρόθεση'],['plan','Σχέδιο'],['self_harm','Αυτοτραυματισμός'],['attempt_history','Ιστορικό απόπειρας'],['protective_factors','Προστατευτικοί παράγοντες'],['clinical_note','Σημείωση κινδύνου']]){
  const b=br?.[key as keyof typeof br],a=ar?.[key as keyof typeof ar];if(a!==b)changes.push({label,before:labels[String(b)]||String(b||'Δεν καταγράφηκε'),after:labels[String(a)]||String(a||'Δεν καταγράφηκε'),beforeId:previous.id,afterId:latest.id});
 }
 return changes;
}
