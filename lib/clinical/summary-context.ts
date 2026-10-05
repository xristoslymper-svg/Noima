import type {PatientBundle} from '../patients/demo-runtime';

export const SUMMARY_POLICY_VERSION=8;
export const categories=['Τρέχουσα εικόνα','Πορεία','Κίνδυνος','Αγωγή','Παρενέργειες','Ψυχομετρικά','Πλάνο','Χρειάζεται επιβεβαίωση','Σημαντικό ιστορικό'] as const;
export type Category=typeof categories[number];
export type Evidence={id:string;kind:string;label:string;date?:string;session_id?:string;content:unknown;target:'sessions'|'medications'|'psychometrics'|'history'|'calendar';record_id:string};
export type Finding={key:string;label:Category;text:string;source_ids:string[];attention:boolean;origin:'canonical'|'documented'|'synthesis'};
const names:Record<string,string>={interview:'Interview',mse:'MSE',assessment:'Assessment',plan:'Πλάνο',review:'Επανεκτίμηση',effects:'Παρενέργειες',functioning:'Λειτουργικότητα',adherence:'Λήψη αγωγής'};
const riskNames:Record<string,string>={suicidal_ideation:'Ιδεασμός',intent:'Πρόθεση',plan:'Σχέδιο',self_harm:'Αυτοτραυματισμός',attempt_history:'Ιστορικό απόπειρας',harm_to_others:'Κίνδυνος προς άλλους'};
const states:Record<string,string>={positive:'θετικό',negative:'αρνητικό',unknown:'άγνωστο',not_assessed:'δεν διερευνήθηκε'};
const medStates:Record<string,string>={active:'ενεργή',stopped:'διακοπείσα',planned:'μελλοντική'};
export const clinicDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function stableSerialize(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stableSerialize).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stableSerialize(v)).join(',')+'}';
 return JSON.stringify(value)??'null';
}
// Shared browser/server fingerprint input. Every record consumed by a derived
// view is included, not a manually maintained list of timestamp dependencies.
export function summaryContextKey(bundle:PatientBundle,day=clinicDay()){
 const {proposals:_,...canonical}=bundle;void _;
 return stableSerialize({policy:SUMMARY_POLICY_VERSION,day,canonical});
}
export async function summaryContextHash(bundle:PatientBundle,day=clinicDay()){
 const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(summaryContextKey(bundle,day)));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
const safetyMention=/(αλλεργ|αναφυλα|anaphyla|allerg|απόπειρ|αποπειρ|attempt|αυτοκτον|suicid|σκέψ.{0,30}θανάτ|σκέψ.{0,50}μην ξυπν|death wish)/iu;
const durableMention=/(αλλεργ|αναφυλα|allerg|anaphyla|απόπειρ|αποπειρ|attempt|ιστορικ|history|νοσηλ|hospital|ουσί|substance|προηγούμεν.{0,30}θεραπ)/iu;
const riskMention=/(αυτοκτον|suicid|σκέψ.{0,30}θανάτ|σκέψ.{0,50}μην ξυπν|death wish|passive death)/iu;
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el');
const sentences=(text:string)=>Array.from(new Intl.Segmenter('el',{granularity:'sentence'}).segment(text),x=>x.segment.trim());
const denied=(text:string)=>/(αρνειται|δεν αναφερει|δεν αναφερεται|denies|no suicidal|no side.effects|not taking)/u.test(normalize(text));
// A denial of a plan must not negate an earlier statement of ideation.
// Contrast clauses are evaluated separately; uncertainty always remains visible.
export const narrativeRiskRequiresReview=(text:string)=>sentences(text).flatMap(s=>s.split(/[,;]|\bbut\b|αλλά|αλλα/iu)).some(s=>{
 if(!riskMention.test(s))return false;
 const n=normalize(s),mention=n.search(/αυτοκτον|suicid|σκεψ|death wish|passive death/u),prefix=n.slice(0,mention);
 if(/(επανελεγχος|ελεγχος|επανεκτιμηση|recheck|reassess|screen for)\s*$/u.test(prefix))return false;
 return /(δεν ρωτη|δεν διερευν|δεν αποκλει|αβεβαι|not asked|uncertain|unknown)/u.test(n)||!denied(prefix)&&!/(χωρις|without|no)\s*$/u.test(prefix);
});
function medicationNeedsReview(text:string,med:PatientBundle['medications'][number]){
 return sentences(text).some(s=>{const n=normalize(s),name=normalize(med.medication_name);if(!n.includes(name)||/(ιστορικ|παλαιο|παλιο|προηγουμεν|historical|previous|in 201\d)/u.test(n))return false;
 const taking=/(συνεχιζ|λαμβαν|taking|continues|started today)/u.test(n),stopping=/(διακοπ|διεκοψ|σταματ|stopped|not taking)/u.test(n);
 if(med.status!=='active'&&taking&&!denied(s))return true;
 if(med.status==='active'&&(stopping||(taking&&denied(s))))return true;
 const dose=n.slice(n.indexOf(name)+name.length).match(/^[^\d]{0,40}(\d+(?:[.,]\d+)?)\s*(mg|mcg|μg)/u);
 return med.status==='active'&&!denied(s)&&Boolean(dose)&&Number(dose![1].replace(',','.'))!==Number(med.dose);
 });
}
const dateLabel=(date?:string)=>date?date.slice(0,10):'';

export function buildSummaryContext(bundle:PatientBundle,day=clinicDay()){
 const completed=[...bundle.sessions].filter(s=>s.status==='completed').sort((a,b)=>Date.parse(b.completed_at||b.started_at)-Date.parse(a.completed_at||a.started_at));
 const ids=new Set(completed.map(s=>s.id));const latest=completed[0];const sources:Evidence[]=[];
 const add=(s:Evidence)=>sources.push(s);
 for(const session of completed){
  for(const section of bundle.sections.filter(s=>s.session_id===session.id&&s.content.trim()))add({id:'section:'+section.id,kind:'session_section',label:`Συνεδρία ${dateLabel(session.completed_at||session.started_at)} · ${names[section.section_key]||section.section_key}`,date:session.completed_at||session.started_at,session_id:session.id,content:section.content,target:'sessions',record_id:section.id});
  const risk=bundle.risks.find(r=>r.session_id===session.id);if(risk)add({id:'risk:'+session.id,kind:'structured_risk',label:`Συνεδρία ${dateLabel(session.completed_at||session.started_at)} · Κίνδυνος`,date:session.completed_at||session.started_at,session_id:session.id,content:risk,target:'sessions',record_id:session.id});
 }
 for(const med of bundle.medications)add({id:'medication:'+med.id,kind:'structured_medication',label:'Αγωγή · '+med.medication_name,content:med,target:'medications',record_id:med.id});
 for(const event of bundle.medicationEvents)add({id:'event:'+event.id,kind:'medication_event',label:`Αλλαγή ${event.effective_on} · ${bundle.medications.find(m=>m.id===event.medication_id)?.medication_name||'Αγωγή'}`,date:event.created_at,session_id:event.session_id||undefined,content:event,target:'medications',record_id:event.id});
 for(const revision of bundle.medicationRevisions.filter(r=>bundle.medicationEvents.some(e=>e.id===r.event_id)))add({id:'revision:'+revision.event_id+':'+revision.created_at,kind:'medication_revision',label:'Διόρθωση αγωγής',date:revision.created_at,content:revision,target:'medications',record_id:revision.event_id});
 for(const effect of bundle.medicationSideEffects)add({id:'side_effect:'+effect.id,kind:'structured_side_effect',label:'Παρενέργεια · '+effect.effect_text,date:effect.noted_on,session_id:effect.session_id||undefined,content:effect,target:'medications',record_id:effect.id});
 for(const assessment of bundle.assessments)add({id:'assessment:'+assessment.id,kind:'psychometric',label:`${assessment.instrument} · ${dateLabel(assessment.completed_at||assessment.created_at)}`,date:assessment.completed_at||assessment.created_at,session_id:assessment.session_id||undefined,content:{...assessment,review_required:assessment.item9_review,review_completed:Boolean(assessment.item9_reviewed_at)},target:'psychometrics',record_id:assessment.id});
 if(bundle.history)add({id:'history:'+bundle.patient.id,kind:'history',label:'Ιστορικό',content:bundle.history,target:'history',record_id:bundle.patient.id});
 for(const a of bundle.addenda.filter(a=>ids.has(a.session_id)))add({id:'addendum:'+a.id,kind:'addendum',label:`${a.kind==='correction'?'Διόρθωση':'Προσθήκη'} · ${dateLabel(a.created_at)}`,date:a.created_at,session_id:a.session_id,content:a,target:'sessions',record_id:a.id});
 for(const a of bundle.appointments)add({id:'appointment:'+a.id,kind:'appointment',label:'Ραντεβού · '+a.scheduled_start,content:a,target:'calendar',record_id:a.id});
 add({id:'patient:'+bundle.patient.id,kind:'patient_context',label:'Στοιχεία / λόγος προσέλευσης',content:{chief_complaint:bundle.patient.chief_complaint,note:bundle.patient.note,reported_age:bundle.patient.reported_age},target:'history',record_id:bundle.patient.id});
 const corrections=sources.filter(s=>s.kind==='addendum');
 const durable=sources.filter(s=>s.kind==='history'||s.kind==='structured_risk'||(s.kind==='session_section'&&durableMention.test(String(s.content))));
 const recentIds=new Set(completed.slice(0,4).map(s=>s.id));
 const trajectory=sources.filter(s=>s.kind==='session_section'&&recentIds.has(s.session_id!));
 const canonical=sources.filter(s=>!['session_section','addendum'].includes(s.kind));
 const correctedParents=new Set(bundle.addenda.filter(a=>a.kind==='correction').map(a=>a.session_id));
 const findings:Finding[]=[];
 const push=(key:string,label:Category,text:string,source_ids:string[],attention=false,origin:Finding['origin']='canonical')=>findings.push({key,label,text,source_ids,attention,origin});
 const risk=latest?bundle.risks.find(r=>r.session_id===latest.id):undefined;
 if(risk){const keys=Object.keys(riskNames);const positive=keys.filter(k=>risk[k as keyof typeof risk]==='positive').map(k=>riskNames[k]);const negative=keys.filter(k=>risk[k as keyof typeof risk]==='negative').map(k=>riskNames[k]);const uncertain=keys.filter(k=>['unknown','not_assessed'].includes(String(risk[k as keyof typeof risk]))).map(k=>`${riskNames[k]} ${risk[k as keyof typeof risk]==='not_assessed'?'δεν διερευνήθηκε':'παραμένει άγνωστο'}`);const parts=[positive.length?`Θετικά ευρήματα: ${positive.join(', ')}.`:'',negative.length?`Δεν καταγράφηκαν: ${negative.join(', ')}.`:'',uncertain.length?`Δεν έχουν αποσαφηνιστεί: ${uncertain.join(', ')}.`:''].filter(Boolean);push('risk','Κίνδυνος',`Εκτίμηση ${dateLabel(latest.completed_at!)}: ${parts.join(' ')} Δεν υποκαθιστά σημερινή εκτίμηση.`,['risk:'+latest.id],keys.some(k=>risk[k as keyof typeof risk]!=='negative'));}
 else push('risk-missing','Κίνδυνος','Δεν υπάρχει ολοκληρωμένη δομημένη εκτίμηση κινδύνου. Το κενό δεν σημαίνει αρνητικό εύρημα.',[],true);
 if(risk?.clinical_note?.trim())push('risk-note','Κίνδυνος',`Κλινική σημείωση κινδύνου ${dateLabel(latest.completed_at!)}: «${risk.clinical_note}»`,['risk:'+latest.id],narrativeRiskRequiresReview(risk.clinical_note),'documented');
 if(bundle.clinical_day&&bundle.clinical_day!==day)push('medication-refresh','Αγωγή','Η ημερομηνία άλλαξε. Απαιτείται ανανέωση της αγωγής πριν εμφανιστεί η σημερινή κατάσταση.',[],true);
 else for(const med of bundle.medications)push('med:'+med.id,'Αγωγή',`${med.medication_name}: ${medStates[med.status]||med.status} · ${med.dose} ${med.unit} · ${med.frequency} · έναρξη ${med.started_at}${med.ended_at?' · διακοπή '+med.ended_at:''}.`,['medication:'+med.id]);
 const superseded=new Set(bundle.medicationRevisions.map(r=>r.event_id));
 for(const e of bundle.medicationEvents.filter(e=>e.effective_on>day&&!superseded.has(e.id)))push('future:'+e.id,'Αγωγή',`Προγραμματισμένη αλλαγή ${e.effective_on}: ${bundle.medications.find(m=>m.id===e.medication_id)?.medication_name||'Αγωγή'} · ${e.event_type} · ${e.new_state?.dose??'—'} ${e.new_state?.unit??''}. Δεν είναι η σημερινή αγωγή.`,['event:'+e.id]);
 for(const effect of bundle.medicationSideEffects.filter(e=>!e.resolved_on))push('effect:'+effect.id,'Παρενέργειες',`${bundle.medications.find(m=>m.id===effect.medication_id)?.medication_name||'Αγωγή'}: ${effect.effect_text} · ${effect.severity==='severe'?'σοβαρή':effect.severity==='mild'?'ήπια':'μέτρια'} · από ${effect.noted_on}${effect.impact?' · '+effect.impact:''}${effect.note?' · '+effect.note:''} · ανεπίλυτη.`,['side_effect:'+effect.id],effect.severity==='severe');
 for(const code of ['PHQ-9','GAD-7']){
  const assessments=bundle.assessments.filter(a=>a.instrument===code&&a.status==='completed').sort((a,b)=>Date.parse(a.completed_at||a.created_at)-Date.parse(b.completed_at||b.created_at));
  if(assessments.length)push('psych:'+code,'Ψυχομετρικά',`${code}: ${assessments.map(a=>`${a.score} (${dateLabel(a.completed_at||a.created_at)})`).join(' → ')}.`,assessments.map(a=>'assessment:'+a.id));
 }
 for(const a of bundle.assessments.filter(a=>a.status==='completed'&&a.item9_review))push('review:'+a.id,'Ψυχομετρικά',a.item9_reviewed_at?`PHQ-9 ${dateLabel(a.completed_at||a.created_at)}: ο έλεγχος λήμματος 9 καταγράφηκε στις ${a.item9_reviewed_at}. Δεν αποτελεί εκτίμηση κινδύνου.`:`PHQ-9 ${dateLabel(a.completed_at||a.created_at)}: λήμμα 9 προς έλεγχο — δεν έχει καταγραφεί ολοκλήρωση ελέγχου.`,['assessment:'+a.id],!a.item9_reviewed_at);
 // Durable narrative is evidence, not promoted structured truth. A corrected
 // parent's original statements are never repeated as a current conclusion.
 const durableNarrative=durable.filter(s=>s.kind==='session_section');
 for(const s of durableNarrative){const parentCorrections=corrections.filter(a=>a.session_id===s.session_id);push('durable:'+s.id,'Σημαντικό ιστορικό',correctedParents.has(s.session_id!)?'Παλαιότερη κλινική καταγραφή με μεταγενέστερη διόρθωση — ελέγξτε μαζί τις πηγές.':`Ιστορική καταγραφή ${dateLabel(s.date)} (δεν αποτελεί σημερινή αξιολόγηση): «${String(s.content)}»`,[s.id,...parentCorrections.map(a=>a.id)],safetyMention.test(String(s.content)),'documented');}
 for(const s of corrections)push('correction:'+s.id,'Χρειάζεται επιβεβαίωση',`Μεταγενέστερη ${s.label.toLocaleLowerCase('el')}: «${(s.content as {content:string}).content}». Ερμηνεύστε την αρχική συνεδρία μαζί με αυτή την προσθήκη.`,[s.id,...sources.filter(x=>x.kind==='session_section'&&x.session_id===s.session_id).map(x=>x.id)],true,'documented');
 for(const old of bundle.risks.filter(r=>ids.has(r.session_id)&&r.session_id!==latest?.id&&r.attempt_history==='positive'))push('past-attempt:'+old.session_id,'Σημαντικό ιστορικό',`Δομημένη καταγραφή προηγούμενης συνεδρίας: θετικό ιστορικό απόπειρας. Η μεταγενέστερη ένδειξη «άγνωστο» ή «δεν διερευνήθηκε» δεν αναιρεί αυτή την καταγραφή${correctedParents.has(old.session_id)?' · υπάρχει διόρθωση προς συνεκτίμηση':''}.`,['risk:'+old.session_id,...corrections.filter(c=>c.session_id===old.session_id).map(c=>c.id)],true);
 // Conservative review cues, not semantic diagnoses. Missing lexical matches
 // cannot establish absence; all narrative remains available to synthesis.
 for(const s of sources.filter(s=>s.kind==='session_section'&&riskMention.test(String(s.content)))){
  const r=bundle.risks.find(r=>r.session_id===s.session_id);
  if(narrativeRiskRequiresReview(String(s.content))&&(!r||['negative','unknown','not_assessed'].includes(r.suicidal_ideation)))push('risk-review:'+s.id,'Χρειάζεται επιβεβαίωση','Η αφηγηματική καταγραφή αναφέρεται σε κίνδυνο ενώ η δομημένη ένδειξη είναι αρνητική, άγνωστη ή μη διερευνημένη. Ελέγξτε χρόνο, άρνηση και συμφωνία των πηγών· δεν έγινε αυτόματη συμφιλίωση.',[s.id,...(r?['risk:'+r.session_id]:[]),...corrections.filter(c=>c.session_id===s.session_id).map(c=>c.id)],true);
 }
 for(const med of bundle.medications){const mentions=trajectory.filter(s=>s.session_id===latest?.id&&!correctedParents.has(s.session_id!)&&medicationNeedsReview(String(s.content),med));if(mentions.length)push('med-review:'+med.id,'Χρειάζεται επιβεβαίωση',`Πιθανή ασυμφωνία αναφοράς ${med.medication_name} · σημερινή δομημένη κατάσταση «${medStates[med.status]||med.status}». Ελέγξτε χρόνο, δόση και συμφωνία πηγών· δεν έγινε αυτόματη μεταβολή αγωγής.`,[...mentions.map(s=>s.id),'medication:'+med.id],true);}
 if(bundle.history)for(const [field,title] of [['allergies','Αλλεργίες'],['psychiatric_history','Ψυχιατρικό ιστορικό'],['medical_history','Ιατρικό ιστορικό'],['previous_treatments','Προηγούμενες θεραπείες'],['hospitalizations','Νοσηλείες'],['family_history','Οικογενειακό ιστορικό'],['substance_history','Ουσίες'],['social_functioning','Λειτουργικότητα']]){const value=bundle.history[field as keyof typeof bundle.history];if(typeof value==='string'&&value.trim())push('history:'+field,'Σημαντικό ιστορικό',`${title} — καταγεγραμμένο ιστορικό: ${value}`,['history:'+bundle.patient.id],field==='allergies');}
 for(const s of sources.filter(s=>s.kind==='session_section')){
  const text=String(s.content);const parentCorrections=corrections.filter(c=>c.session_id===s.session_id);
  if(/(παρενέργ|ανεπιθύμητ|ναυτί|ναυτία|υπνηλί|ζάλη|σύγχυσ|nausea|side.effect|confusion)/iu.test(text))push('narrative-effect:'+s.id,'Παρενέργειες',parentCorrections.length?'Αφηγηματική αναφορά παρενέργειας σε διορθωμένη συνεδρία — χρειάζεται συνεκτίμηση των πηγών.':`Αναφορά στη συνεδρία ${dateLabel(s.date)} · δεν μεταβάλλει τη δομημένη καταγραφή: «${text}»`,[s.id,...parentCorrections.map(c=>c.id)],true,'documented');
  if(/\d\s*(mg|μg|mcg|ml|χιλιοστόγραμμ)/iu.test(text)&&!bundle.medications.some(m=>text.toLowerCase().includes(m.medication_name.toLowerCase())))push('unstructured-med:'+s.id,'Χρειάζεται επιβεβαίωση','Υπάρχει αφηγηματική αναφορά δόσης χωρίς αντίστοιχη δομημένη αγωγή. Ελέγξτε αν αφορά τρέχουσα ή ιστορική θεραπεία.',[s.id,...parentCorrections.map(c=>c.id)],true,'documented');
 }
 return {day,patient_id:bundle.patient.id,sources,layers:{durable,canonical,trajectory,corrections,archive:sources.filter(s=>s.kind==='session_section')},findings};
}

export type SummaryContext=ReturnType<typeof buildSummaryContext>;
// A useful record-derived briefing remains available without a model. Whole
// recorded sections retain date/source attribution; drafts and corrected parents
// cannot become current conclusions. The UI can collapse long evidence.
export function canonicalSummaryFindings(context:SummaryContext):Finding[]{
 const sections=context.sources.filter(s=>s.kind==='session_section');
 const latest=[...sections].sort((a,b)=>Date.parse(b.date||'')-Date.parse(a.date||''))[0]?.session_id;
 const corrected=new Set(context.layers.corrections.map(c=>c.session_id));
 const selected=sections.filter(s=>s.session_id===latest&&!corrected.has(s.session_id));
 const additions:Finding[]=[];
 for(const source of selected){
  const suffix=source.label.split(' · ').pop();
  const category:Category|undefined=['Assessment','Interview','MSE','Λειτουργικότητα'].includes(suffix||'')?'Τρέχουσα εικόνα':['Πλάνο','Επανεκτίμηση'].includes(suffix||'')?'Πλάνο':undefined;
  if(!category)continue;
  additions.push({key:'record:'+source.id,label:category,text:source.label+' — καταγεγραμμένο: '+String(source.content),source_ids:[source.id],attention:false,origin:'documented'});
 }
 return [...context.findings,...additions];
}

export function validateNarrative(output:unknown,context:SummaryContext):Finding[]{
 if(!output||typeof output!=='object'||!('findings' in output)||!Array.isArray(output.findings))throw new Error('invalid_output');
 const list=output.findings;if(list.length>3)throw new Error('invalid_count');
 const used=new Set<string>();
 const latest=[...context.sources.filter(s=>s.kind==='session_section')].sort((a,b)=>Date.parse(b.date||'')-Date.parse(a.date||''))[0]?.session_id;
 return list.map((f:unknown,index)=>{
  if(!f||typeof f!=='object')throw new Error('invalid_finding');
  const item=f as {label:string;text:string;source_ids:string[]};
  if(!['Τρέχουσα εικόνα','Πορεία','Πλάνο'].includes(item.label)||used.has(item.label)||typeof item.text!=='string'||item.text.trim().length<12||item.text.length>420||!Array.isArray(item.source_ids)||!item.source_ids.length||item.source_ids.length>4)throw new Error('invalid_category');
  used.add(item.label);
  if(/(ignore.{0,30}instruction|AUDIT_INJECTION|αγνόησε.{0,30}οδηγ)/iu.test(item.text))throw new Error('unsafe_text');
  const sources=item.source_ids.map(id=>context.sources.find(s=>s.id===id));
  if(sources.some(s=>!s||s.kind!=='session_section'))throw new Error('unsupported_source');
  if(sources.some(s=>context.layers.corrections.some(c=>c.session_id===s!.session_id)))throw new Error('corrected_parent');
  const sessionIds=new Set(sources.map(s=>s!.session_id));
  if(item.label==='Πορεία'&&(sessionIds.size<2||sessionIds.has(undefined)))throw new Error('trajectory_requires_two_visits');
  if(item.label!=='Πορεία'&&[...sessionIds].some(id=>id!==latest))throw new Error('obsolete_current_source');
  return {key:'narrative:'+index,label:item.label as Category,text:item.text.trim(),source_ids:item.source_ids,attention:false,origin:'synthesis'};
 });
}
function contextSectionKey(label:string){return label.split(' · ').pop()||label;}
export function assertCriticalCoverage(final:Finding[],context:SummaryContext){
 const required=context.findings.filter(f=>f.attention||f.label==='Αγωγή'||f.label==='Ψυχομετρικά'||f.label==='Παρενέργειες');
 for(const expected of required){if(!final.some(f=>f.key===expected.key&&f.text===expected.text&&f.source_ids.join('|')===expected.source_ids.join('|')))throw new Error('critical_coverage_failed');}
}
