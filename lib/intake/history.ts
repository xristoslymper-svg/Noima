export type IntakeIdentity={first_name:string;last_name:string;age:string;phone:string;email:string;amka:string;address:string;contact_phone:string};
export type HistoryAnswers={
 reasons:string[];duration:string;reason_note:string;
 psychiatrist:string;psychiatrist_recent:string;psychotherapy:string;therapy_help:string;diagnosis_status:string;diagnoses:string[];
 past_meds:string;past_medication_name:string;past_med_help:string;past_med_side_effects:string;
 current_meds:string;current_medication_name:string;
 hospitalised:string;hospital_count:string;hospital_recent:string;self_harm:string;suicide_attempt:string;
 medical:Record<string,string>;medical_other:string;allergy_detail:string;
 substances:Record<string,string>;substance_frequency:Record<string,string>;
 family:Record<string,string[]>;relationship_status:string;children:string;living:string;work:string;work_difficulty:string;
 support:string;stressors:string[];legal:string;trauma:string;trauma_note:string;other_note:string;
};
export const emptyIdentity: IntakeIdentity={first_name:'',last_name:'',age:'',phone:'',email:'',amka:'',address:'',contact_phone:''};
export const emptyHistory:HistoryAnswers={reasons:[],duration:'',reason_note:'',psychiatrist:'',psychiatrist_recent:'',psychotherapy:'',therapy_help:'',diagnosis_status:'',diagnoses:[],past_meds:'',past_medication_name:'',past_med_help:'',past_med_side_effects:'',current_meds:'',current_medication_name:'',hospitalised:'',hospital_count:'',hospital_recent:'',self_harm:'',suicide_attempt:'',medical:{},medical_other:'',allergy_detail:'',substances:{},substance_frequency:{},family:{},relationship_status:'',children:'',living:'',work:'',work_difficulty:'',support:'',stressors:[],legal:'',trauma:'',trauma_note:'',other_note:''};
export const reasonOptions=['Άγχος','Διάθεση / κατάθλιψη','Πανικός','Ύπνος','Συγκέντρωση / προσοχή','Αλλαγές διάθεσης','Σχέσεις / οικογένεια','Εργασία / σπουδές','Χρήση ουσιών','Άλλο'];
export const diagnosisOptions=['Κατάθλιψη','Αγχώδης διαταραχή','Διπολική διαταραχή','ADHD','OCD','Ψυχωτική διαταραχή','Διατροφική διαταραχή','PTSD / τραύμα','Διαταραχή χρήσης ουσιών','Άλλη','Δεν θυμάμαι'];
export const medicalOptions=['Χρόνια σωματική πάθηση','Νευρολογική πάθηση','Σημαντικός τραυματισμός κεφαλής','Χειρουργείο','Σημαντική νοσηλεία','Γνωστές αλλεργίες','Αλλεργία σε φάρμακο'];
export const substanceOptions=['Καπνός','Αλκοόλ','Κάνναβη','Κοκαΐνη / διεγερτικά','Οπιοειδή','Άλλες ουσίες'];
export const familyConditions=['Κατάθλιψη','Διπολική διαταραχή','Ψύχωση','Αγχώδης διαταραχή','Εξάρτηση','Απόπειρα / αυτοκτονία','Άλλη σοβαρή ψυχιατρική νόσος'];
export const familyRelations=['Μητέρα','Πατέρας','Αδέλφια','Παιδιά','Άλλος συγγενής'];

const yes=(v:string)=>v==='yes'?'Ναι':v==='no'?'Όχι':v==='prefer'?'Προτιμά να συζητηθεί με τον γιατρό':v||'Δεν απαντήθηκε';
const list=(x:string[])=>x.length?x.join(', '):'—';
export function historyDraftFromAnswers(h:HistoryAnswers){
 const psych=[
  'Επίσκεψη σε ψυχίατρο: '+yes(h.psychiatrist)+(h.psychiatrist==='yes'&&h.psychiatrist_recent?' · πιο πρόσφατα '+h.psychiatrist_recent:''),
  'Ψυχοθεραπεία/ψυχολόγος: '+yes(h.psychotherapy)+(h.psychotherapy==='yes'&&h.therapy_help?' · όφελος '+h.therapy_help:''),
  'Προηγούμενη διάγνωση: '+(h.diagnosis_status||'Δεν απαντήθηκε')+(h.diagnoses.length?' · '+list(h.diagnoses):''),
  'Ιστορικό αυτοτραυματισμού: '+yes(h.self_harm),
  'Ιστορικό απόπειρας αυτοκτονίας: '+yes(h.suicide_attempt)
 ].join('\n');
 const treatments=[
  'Προηγούμενη ψυχιατρική αγωγή: '+yes(h.past_meds)+(h.past_medication_name?' · '+h.past_medication_name:'')+(h.past_med_help?' · όφελος '+h.past_med_help:'')+(h.past_med_side_effects?' · σημαντικές παρενέργειες '+yes(h.past_med_side_effects):''),
  'Τρέχουσα αγωγή (αναφορά ασθενούς): '+yes(h.current_meds)+(h.current_medication_name?' · '+h.current_medication_name:'')
 ].join('\n');
 const hospital='Ψυχιατρική νοσηλεία: '+yes(h.hospitalised)+(h.hospitalised==='yes'?' · '+(h.hospital_count||'')+(h.hospital_recent?' · πιο πρόσφατη '+h.hospital_recent:''):'');
 const medical=medicalOptions.filter(x=>h.medical[x]==='yes').join(', ')||'Δεν δηλώθηκαν επιλεγμένες σημαντικές παθήσεις';
 const allergies=(h.medical['Γνωστές αλλεργίες']==='yes'||h.medical['Αλλεργία σε φάρμακο']==='yes')?(h.allergy_detail||'Αναφέρθηκε αλλεργία χωρίς λεπτομέρεια'):'Δεν αναφέρθηκε γνωστή αλλεργία στο ερωτηματολόγιο';
 const substances=substanceOptions.map(s=>s+': '+(h.substances[s]||'δεν απαντήθηκε')+(h.substance_frequency[s]?' · '+h.substance_frequency[s]:'')).join('\n');
 const family=familyConditions.map(c=>h.family[c]?.length?c+': '+h.family[c].join(', '):'').filter(Boolean).join('\n')||'Δεν δηλώθηκε οικογενειακό ψυχιατρικό ιστορικό';
 const social=[
  'Οικογενειακή/σχεσιακή κατάσταση: '+(h.relationship_status||'—'),
  'Παιδιά: '+(h.children||'—'),'Διαμονή: '+(h.living||'—'),'Εργασία/σπουδές: '+(h.work||'—'),
  'Δυσκολία στην εργασία/σπουδές: '+(h.work_difficulty||'—'),'Υποστήριξη: '+(h.support||'—'),
  'Πρόσφατοι στρεσογόνοι παράγοντες: '+list(h.stressors),'Νομικά προβλήματα: '+yes(h.legal),
  'Τραυματική εμπειρία: '+yes(h.trauma)+(h.trauma_note?' · '+h.trauma_note:''),
  h.other_note?'Άλλο που θέλει να γνωρίζει ο γιατρός: '+h.other_note:''
 ].filter(Boolean).join('\n');
 return {psychiatric_history:psych,medical_history:medical+(h.medical_other?'\nΆλλο: '+h.medical_other:''),previous_treatments:treatments,hospitalizations:hospital,family_history:family,substance_history:substances,social_functioning:social,allergies};
}
