import {emptyHistory, type HistoryAnswers} from './history.ts';
export type ReceivedHistory={
 id:string;
 status:string;
 tools:string[];
 history_answers:Partial<HistoryAnswers>|null;
 submitted_at:string|null;
 channel:string;
};
export function receivedPatientHistories(records:ReceivedHistory[]){
 return records.filter(r=>r.status==='submitted'&&r.tools?.includes('history')&&r.history_answers&&typeof r.history_answers==='object')
  .sort((a,b)=>Date.parse(b.submitted_at||'')-Date.parse(a.submitted_at||''));
}
export function normalizedPatientHistory(raw:Partial<HistoryAnswers>|null):HistoryAnswers{
 const h=raw||{};
 return {...emptyHistory,...h,
  reasons:Array.isArray(h.reasons)?h.reasons:[],
  diagnoses:Array.isArray(h.diagnoses)?h.diagnoses:[],
  stressors:Array.isArray(h.stressors)?h.stressors:[],
  medical:h.medical&&typeof h.medical==='object'?h.medical:{},
  substances:h.substances&&typeof h.substances==='object'?h.substances:{},
  substance_frequency:h.substance_frequency&&typeof h.substance_frequency==='object'?h.substance_frequency:{},
  family:h.family&&typeof h.family==='object'?h.family:{},
 };
}
export function patientReportedHighlights(h:HistoryAnswers){
 const facts:string[]=[];
 if(h.reasons.length)facts.push('Λόγοι προσέλευσης: '+h.reasons.join(', '));
 if(h.duration)facts.push('Διάρκεια συμπτωμάτων: '+(({lt1m:'Λιγότερο από 1 μήνα','1-6m':'1–6 μήνες','6-12m':'6–12 μήνες',gt1y:'Πάνω από 1 χρόνο'} as Record<string,string>)[h.duration]||h.duration));
 if(h.current_meds==='yes')facts.push('Αναφερόμενη αγωγή: '+(h.current_medication_name||'χωρίς λεπτομέρειες'));
 else if(h.current_meds==='no')facts.push('Κατά τη συμπλήρωση ανέφερε ότι δεν λάμβανε αγωγή');
 if(h.suicide_attempt==='yes')facts.push('Αναφέρει ιστορικό απόπειρας αυτοκτονίας');
 if(h.self_harm==='yes')facts.push('Αναφέρει ιστορικό αυτοτραυματισμού');
 return facts.slice(0,5);
}
