export type DiagnosisCode={code:string;label:string;system:'WHO ICD-10';edition:'2019'};
export type DocumentField={key:string;label:string;text:string;writing_provenance?:import('./clinical-writing').WritingProvenance;reference?:{session_id:string;date:string};review?:'unchanged'|'changed'|'not_assessed';codes?:DiagnosisCode[];status?:'provisional'|'under_investigation'|'confirmed'};
export type VisitDocument={kind:'mse'|'assessment';fields:DocumentField[]};
export const mseItems=[
 ['appearance','Appearance / Behaviour','εμφάνιση, υγιεινή, στάση, βλεμματική επαφή, ψυχοκινητικότητα, συνεργασιμότητα'],
 ['speech','Speech','ποσότητα, ρυθμός, ένταση, latency, αυθόρμητος/πιεστικός λόγος'],
 ['mood','Mood','υποκειμενικό συναίσθημα'],
 ['affect','Affect','εύρος, ένταση, κινητικότητα, ποιότητα, congruence'],
 ['thought_process','Thought process / form','γραμμική/λογική ή αποδιοργανωμένη, tangentiality, circumstantiality, flight of ideas, loosening, thought blocking'],
 ['thought_content','Thought content','παραληρητικές ιδέες, ιδέες αναφοράς/υπερεκτίμησης, ιδεοληψίες, φοβίες, SI/HI'],
 ['perception','Perception','ψευδαισθήσεις/ψευδαισθησίες και άλλες διαταραχές αντίληψης'],
 ['cognition','Cognition','επίπεδο συνείδησης, προσανατολισμός, attention/concentration, μνήμη, executive functions/abstraction'],
 ['insight','Insight','επίγνωση νόσου/συμπτωμάτων και ανάγκης θεραπείας'],
 ['judgment','Judgment','κρίση και ικανότητα λήψης αποφάσεων'],
 ['impulse_control','Impulse control','έλεγχος παρορμήσεων, όπου σχετικό'],
 ['reliability','Reliability','αξιοπιστία ιστορικού/απαντήσεων'],
] as const;
export function initialDocument(kind:VisitDocument['kind'],content='',document?:VisitDocument|null):VisitDocument{
 if(document?.kind===kind)return document;
 const fields:DocumentField[]=kind==='mse'?mseItems.map(([key,label])=>({key,label,text:''})):[{key:'differential-1',label:'Differential Diagnosis',text:'',status:'under_investigation',codes:[]},{key:'diagnosis',label:'Diagnosis',text:'',codes:[]},{key:'formulation',label:'Formulation',text:''},{key:'impression',label:'Clinical Assessment / Impression',text:''}];
 // Legacy narrative remains explicit; never infer structured observations from it.
 if(content.trim())fields.push({key:'legacy',label:'Προϋπάρχουσα αφηγηματική καταγραφή',text:content});
 return {kind,fields};
}
