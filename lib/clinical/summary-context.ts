import type {PatientBundle} from '../patients/demo-runtime';
import type {VisitDocument} from './visit-document';

export const SUMMARY_POLICY_VERSION=16;
export const categories=['Τρέχουσα εικόνα','Πορεία','Κίνδυνος','Αγωγή','Παρενέργειες','Ψυχομετρικά','Πλάνο','Χρειάζεται επιβεβαίωση','Σημαντικό ιστορικό'] as const;
export type Category=typeof categories[number];
export type Evidence={id:string;kind:string;label:string;date?:string;session_id?:string;content:unknown;target:'sessions'|'medications'|'psychometrics'|'history'|'calendar';record_id:string};
export const summaryThemes=['general','medication','course','risk','psychometrics','plan','context'] as const;
export type SummaryTheme=typeof summaryThemes[number];
export type Finding={key:string;label:Category;text:string;source_ids:string[];attention:boolean;origin:'canonical'|'documented'|'synthesis';group_label?:string;theme?:SummaryTheme};
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
const effectMention=/(παρενέργ|ανεπιθύμητ|ναυτί|υπνηλί|ζάλη|σύγχυσ|nausea|side.effect|confusion|αναφυλα|anaphyla)/iu;
const narrativeEffectNeedsReview=(text:string)=>sentences(text).flatMap(s=>s.split(/[,;]|\bbut\b|αλλά|αλλα/iu)).some(s=>effectMention.test(s)&&/(σοβαρ|severe|αναφυλα|anaphyla)/iu.test(s)&&!denied(s)&&!/(χωρις|without|no severe|υποχωρ|resolved)/u.test(normalize(s)));
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
function clinicalSessionTime(bundle:PatientBundle,session:PatientBundle['sessions'][number]){
 const appointment=bundle.appointments?.find(a=>a.session_id===session.id);
 return appointment?.scheduled_start||session.started_at||session.completed_at||'';
}
function structuredCorrections(bundle:PatientBundle,sessionId:string){
 return (bundle.corrections||[]).filter(c=>c.session_id===sessionId).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id));
}
function correctedRisk(bundle:PatientBundle,sessionId:string){
 let value=bundle.risks.find(r=>r.session_id===sessionId);
 for(const correction of structuredCorrections(bundle,sessionId)){
  const after=correction.patch?.risk?.after;
  if(after&&typeof after==='object')value={...(value||{session_id:sessionId,patient_id:bundle.patient.id,suicidal_ideation:'not_assessed',intent:'not_assessed',plan:'not_assessed',self_harm:'not_assessed',attempt_history:'not_assessed',protective_factors:'',clinical_note:'',version:0,updated_at:''}),...(after as Partial<PatientBundle['risks'][number]>)};
 }
 if(value?.tree){
  const answers={...value.tree.answers};
  if(value.suicidal_ideation)answers.wish=value.suicidal_ideation;
  if(value.intent)answers.intent=value.intent;
  if(value.plan)answers.plan=value.plan;
  if(value.harm_to_others)answers.others=value.harm_to_others;
  value={...value,tree:{...value.tree,answers}};
 }
 return value;
}
function renderedDocument(value:unknown){
 if(!value||typeof value!=='object'||!('fields' in value)||!Array.isArray((value as {fields?:unknown}).fields))return null;
 const fields=(value as {fields:Array<{label?:string;text?:string;status?:string;codes?:Array<{code?:string;label?:string}>}>}).fields;
 const text=fields.flatMap(field=>{
  const body=(field.text||'').trim();
  const codes=(field.codes||[]).map(code=>[code.code,code.label].filter(Boolean).join(' · ')).filter(Boolean).join('; ');
  if(!body&&!codes)return [];
  const status=field.status==='confirmed'?' · επιβεβαιωμένη':field.status==='provisional'?' · προσωρινή':field.status==='under_investigation'?' · υπό διερεύνηση':'';
  return [(field.label||'Πεδίο')+status+': '+[body,codes].filter(Boolean).join('\n')];
 });
 return text.join('\n\n');
}
function correctedSectionContent(bundle:PatientBundle,section:PatientBundle['sections'][number]){
 let value:string=section.content;
 for(const correction of structuredCorrections(bundle,section.session_id)){
  const after=correction.patch?.[section.section_key]?.after;
  if(typeof after==='string')value=after;
  else {const rendered=renderedDocument(after);if(rendered!==null)value=rendered;}
 }
 return value;
}
function effectiveMseDocument(bundle:PatientBundle,section:PatientBundle['sections'][number]):VisitDocument|null{
 let document=section.document;
 for(const correction of structuredCorrections(bundle,section.session_id)){
  const after=correction.patch?.mse?.after;
  if(typeof after==='string')document=null;
  else if(after&&typeof after==='object'&&'kind' in after)document=after as VisitDocument;
 }
 return document?.kind==='mse'?document:null;
}

export function buildSummaryContext(bundle:PatientBundle,day=clinicDay()){
 const completed=[...bundle.sessions].filter(s=>s.status==='completed').sort((a,b)=>Date.parse(clinicalSessionTime(bundle,b))-Date.parse(clinicalSessionTime(bundle,a)));
 const ids=new Set(completed.map(s=>s.id));const latest=completed[0];const sources:Evidence[]=[];
 const add=(s:Evidence)=>sources.push(s);
 for(const session of completed){
  const encounterTime=clinicalSessionTime(bundle,session);
  for(const section of bundle.sections.filter(s=>s.session_id===session.id)){
   const content=correctedSectionContent(bundle,section);if(!content.trim())continue;
   add({id:'section:'+section.id,kind:'session_section',label:`Συνεδρία ${dateLabel(encounterTime)} · ${names[section.section_key]||section.section_key}`,date:encounterTime,session_id:session.id,content,target:'sessions',record_id:section.id});
  }
  const risk=correctedRisk(bundle,session.id);if(risk)add({id:'risk:'+session.id,kind:'structured_risk',label:`Συνεδρία ${dateLabel(encounterTime)} · Κίνδυνος`,date:encounterTime,session_id:session.id,content:risk,target:'sessions',record_id:session.id});
 }
 for(const med of bundle.medications)add({id:'medication:'+med.id,kind:'structured_medication',label:'Αγωγή · '+med.medication_name,content:med,target:'medications',record_id:med.id});
 for(const event of bundle.medicationEvents)add({id:'event:'+event.id,kind:'medication_event',label:`Αλλαγή ${event.effective_on} · ${bundle.medications.find(m=>m.id===event.medication_id)?.medication_name||'Αγωγή'}`,date:event.created_at,session_id:event.session_id||undefined,content:event,target:'medications',record_id:event.id});
 for(const revision of bundle.medicationRevisions.filter(r=>bundle.medicationEvents.some(e=>e.id===r.event_id)))add({id:'revision:'+revision.event_id+':'+revision.created_at,kind:'medication_revision',label:'Διόρθωση αγωγής',date:revision.created_at,content:revision,target:'medications',record_id:revision.event_id});
 for(const effect of bundle.medicationSideEffects)add({id:'side_effect:'+effect.id,kind:'structured_side_effect',label:'Παρενέργεια · '+effect.effect_text,date:effect.noted_on,session_id:effect.session_id||undefined,content:effect,target:'medications',record_id:effect.id});
 for(const assessment of bundle.assessments)add({id:'assessment:'+assessment.id,kind:'psychometric',label:`${assessment.instrument} · ${dateLabel(assessment.completed_at||assessment.created_at)}`,date:assessment.completed_at||assessment.created_at,session_id:assessment.session_id||undefined,content:{...assessment,review_required:assessment.item9_review,review_completed:Boolean(assessment.item9_reviewed_at)},target:'psychometrics',record_id:assessment.id});
 if(bundle.history)add({id:'history:'+bundle.patient.id,kind:'history',label:'Ιστορικό',content:bundle.history,target:'history',record_id:bundle.patient.id});
 for(const a of bundle.addenda.filter(a=>ids.has(a.session_id)))add({id:'addendum:'+a.id,kind:'addendum',label:`${a.kind==='correction'?'Διόρθωση':'Προσθήκη'} · ${dateLabel(a.created_at)}`,date:a.created_at,session_id:a.session_id,content:a,target:'sessions',record_id:a.id});
 for(const correction of (bundle.corrections||[]).filter(c=>ids.has(c.session_id)))add({id:'structured_correction:'+correction.id,kind:'structured_correction',label:`Δομημένη διόρθωση · ${dateLabel(correction.created_at)}`,date:correction.created_at,session_id:correction.session_id,content:correction,target:'sessions',record_id:correction.id});
 for(const a of bundle.appointments)add({id:'appointment:'+a.id,kind:'appointment',label:'Ραντεβού · '+a.scheduled_start,content:a,target:'calendar',record_id:a.id});
 add({id:'patient:'+bundle.patient.id,kind:'patient_context',label:'Στοιχεία / λόγος προσέλευσης',content:{chief_complaint:bundle.patient.chief_complaint,note:bundle.patient.note,reported_age:bundle.patient.reported_age},target:'history',record_id:bundle.patient.id});
 const corrections=sources.filter(s=>s.kind==='structured_correction'||(s.kind==='addendum'&&(s.content as {kind:string}).kind==='correction'));
 const durable=sources.filter(s=>s.kind==='history'||s.kind==='structured_risk'||(s.kind==='session_section'&&durableMention.test(String(s.content))));
 const recentIds=new Set(completed.slice(0,4).map(s=>s.id));
 const trajectory=sources.filter(s=>s.kind==='session_section'&&recentIds.has(s.session_id!));
 const canonical=sources.filter(s=>!['session_section','addendum','structured_correction'].includes(s.kind));
 const correctedParents=new Set([...bundle.addenda.filter(a=>a.kind==='correction').map(a=>a.session_id),...(bundle.corrections||[]).map(c=>c.session_id)]);
 const findings:Finding[]=[];
 const push=(key:string,label:Category,text:string,source_ids:string[],attention=false,origin:Finding['origin']='canonical')=>findings.push({key,label,text,source_ids,attention,origin});
 const risk=latest?correctedRisk(bundle,latest.id):undefined;
 if(risk){const keys=Object.keys(riskNames);const positive=keys.filter(k=>risk[k as keyof typeof risk]==='positive').map(k=>riskNames[k]);const negative=keys.filter(k=>risk[k as keyof typeof risk]==='negative').map(k=>riskNames[k]);const uncertain=keys.filter(k=>['unknown','not_assessed'].includes(String(risk[k as keyof typeof risk]))).map(k=>`${riskNames[k]} ${risk[k as keyof typeof risk]==='not_assessed'?'δεν διερευνήθηκε':'παραμένει άγνωστο'}`);const parts=[positive.length?`Θετικά ευρήματα: ${positive.join(', ')}.`:'',negative.length?`Δεν καταγράφηκαν: ${negative.join(', ')}.`:'',uncertain.length?`Δεν έχουν αποσαφηνιστεί: ${uncertain.join(', ')}.`:''].filter(Boolean);push('risk','Κίνδυνος',`Εκτίμηση ${dateLabel(clinicalSessionTime(bundle,latest))}: ${parts.join(' ')} Δεν υποκαθιστά σημερινή εκτίμηση.`,['risk:'+latest.id],keys.some(k=>!['intent','plan'].includes(k)&&risk[k as keyof typeof risk]!=='negative')||(['unknown','positive'].includes(risk.suicidal_ideation)&&[risk.intent,risk.plan].some(v=>v!=='negative')));}
 else push('risk-missing','Κίνδυνος','Δεν υπάρχει ολοκληρωμένη δομημένη εκτίμηση κινδύνου. Το κενό δεν σημαίνει αρνητικό εύρημα.',[],true);
 if(risk?.clinical_note?.trim())push('risk-note','Κίνδυνος',`Κλινική σημείωση κινδύνου ${dateLabel(clinicalSessionTime(bundle,latest))}: «${risk.clinical_note}»`,['risk:'+latest.id],narrativeRiskRequiresReview(risk.clinical_note),'documented');
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
 for(const s of corrections){
  if(s.kind==='structured_correction'){
   const c=s.content as {reason:string;patch:Record<string,{before:unknown;after:unknown}>};
   push('correction:'+s.id,'Χρειάζεται επιβεβαίωση',`Δομημένη διόρθωση ${dateLabel(s.date)}: ${c.reason}. Η τρέχουσα προβολή της συνεδρίας περιλαμβάνει ${Object.keys(c.patch||{}).length} διορθωμένα πεδία/ενότητες.`,[s.id,...sources.filter(x=>x.kind==='session_section'&&x.session_id===s.session_id).map(x=>x.id)],true,'documented');
  }else push('correction:'+s.id,'Χρειάζεται επιβεβαίωση',`Μεταγενέστερη ${s.label.toLocaleLowerCase('el')}: «${(s.content as {content:string}).content}». Ερμηνεύστε την αρχική συνεδρία μαζί με αυτή την προσθήκη.`,[s.id,...sources.filter(x=>x.kind==='session_section'&&x.session_id===s.session_id).map(x=>x.id)],true,'documented');
 }
 for(const session of completed.filter(s=>s.id!==latest?.id)){const old=correctedRisk(bundle,session.id);if(!old||old.attempt_history!=='positive')continue;push('past-attempt:'+old.session_id,'Σημαντικό ιστορικό',`Δομημένη καταγραφή προηγούμενης συνεδρίας: θετικό ιστορικό απόπειρας. Η μεταγενέστερη ένδειξη «άγνωστο» ή «δεν διερευνήθηκε» δεν αναιρεί αυτή την καταγραφή${correctedParents.has(old.session_id)?' · υπάρχει διόρθωση προς συνεκτίμηση':''}.`,['risk:'+old.session_id,...corrections.filter(c=>c.session_id===old.session_id).map(c=>c.id)],true);}
 // Conservative review cues, not semantic diagnoses. Missing lexical matches
 // cannot establish absence; all narrative remains available to synthesis.
 for(const s of sources.filter(s=>s.kind==='session_section'&&riskMention.test(String(s.content)))){
  const r=s.session_id?correctedRisk(bundle,s.session_id):undefined;
  if(narrativeRiskRequiresReview(String(s.content))&&(!r||['negative','unknown','not_assessed'].includes(r.suicidal_ideation)))push('risk-review:'+s.id,'Χρειάζεται επιβεβαίωση','Η αφηγηματική καταγραφή αναφέρεται σε κίνδυνο ενώ η δομημένη ένδειξη είναι αρνητική, άγνωστη ή μη διερευνημένη. Ελέγξτε χρόνο, άρνηση και συμφωνία των πηγών· δεν έγινε αυτόματη συμφιλίωση.',[s.id,...(r?['risk:'+r.session_id]:[]),...corrections.filter(c=>c.session_id===s.session_id).map(c=>c.id)],true);
 }
 for(const med of bundle.medications){const mentions=trajectory.filter(s=>s.session_id===latest?.id&&!correctedParents.has(s.session_id!)&&medicationNeedsReview(String(s.content),med));if(mentions.length)push('med-review:'+med.id,'Χρειάζεται επιβεβαίωση',`Πιθανή ασυμφωνία αναφοράς ${med.medication_name} · σημερινή δομημένη κατάσταση «${medStates[med.status]||med.status}». Ελέγξτε χρόνο, δόση και συμφωνία πηγών· δεν έγινε αυτόματη μεταβολή αγωγής.`,[...mentions.map(s=>s.id),'medication:'+med.id],true);}
 if(bundle.history)for(const [field,title] of [['allergies','Αλλεργίες'],['psychiatric_history','Ψυχιατρικό ιστορικό'],['medical_history','Ιατρικό ιστορικό'],['previous_treatments','Προηγούμενες θεραπείες'],['hospitalizations','Νοσηλείες'],['family_history','Οικογενειακό ιστορικό'],['substance_history','Ουσίες'],['social_functioning','Λειτουργικότητα']]){const value=bundle.history[field as keyof typeof bundle.history];if(typeof value==='string'&&value.trim())push('history:'+field,'Σημαντικό ιστορικό',`${title} — καταγεγραμμένο ιστορικό: ${value}`,['history:'+bundle.patient.id],field==='allergies'&&!/^(δεν αναφέρει γνωστές φαρμακευτικές αλλεργίες[.]?|αρνείται (γνωστές )?αλλεργίες[.]?|no known (drug )?allergies[.]?)$/iu.test(value.trim()));}
 for(const s of sources.filter(s=>s.kind==='session_section')){
  const text=String(s.content);const parentCorrections=corrections.filter(c=>c.session_id===s.session_id);
  if(effectMention.test(text))push('narrative-effect:'+s.id,'Παρενέργειες',parentCorrections.length?'Αφηγηματική αναφορά παρενέργειας σε διορθωμένη συνεδρία — χρειάζεται συνεκτίμηση των πηγών.':`Αναφορά στη συνεδρία ${dateLabel(s.date)} · δεν μεταβάλλει τη δομημένη καταγραφή: «${text}»`,[s.id,...parentCorrections.map(c=>c.id)],narrativeEffectNeedsReview(text),'documented');
  if(/\d\s*(mg|μg|mcg|ml|χιλιοστόγραμμ)/iu.test(text)&&!bundle.medications.some(m=>text.toLowerCase().includes(m.medication_name.toLowerCase())))push('unstructured-med:'+s.id,'Χρειάζεται επιβεβαίωση','Υπάρχει αφηγηματική αναφορά δόσης χωρίς αντίστοιχη δομημένη αγωγή. Ελέγξτε αν αφορά τρέχουσα ή ιστορική θεραπεία.',[s.id,...parentCorrections.map(c=>c.id)],true,'documented');
 }
 // Compare the two actual encounters, applying corrections to both snapshots.
 // A blank/unassessed domain is missing evidence, never a resolved symptom.
 const previous=completed[1];
 const currentMse=bundle.sections.find(s=>s.session_id===latest?.id&&s.section_key==='mse');
 const previousMse=bundle.sections.find(s=>s.session_id===previous?.id&&s.section_key==='mse');
 if(currentMse&&previousMse&&!corrections.some(c=>c.kind==='addendum'&&[currentMse.session_id,previousMse.session_id].includes(c.session_id!))){
  const before=effectiveMseDocument(bundle,previousMse),after=effectiveMseDocument(bundle,currentMse);
  if(before&&after){
   const changes=after.fields.flatMap(field=>{
    const old=before.fields.find(f=>f.key===field.key);
    return field.key!=='legacy'&&old?.text.trim()&&field.text.trim()&&field.review!=='not_assessed'&&field.text!==old.text?[`${field.label}: «${old.text}» → «${field.text}»`]:[];
   });
   const detail=changes.join(' · ');
   const comparison=detail.length<=300?detail:'Μεταβλήθηκαν οι καταγραφές για '+after.fields.filter(field=>changes.some(change=>change.startsWith(field.label+':'))).map(field=>field.label).join(', ')+'. Οι πλήρεις καταγραφές εμφανίζονται στις δύο πηγές.';
   if(changes.length)push('mse-change:'+currentMse.id,'Πορεία',`Καταγεγραμμένες μεταβολές MSE (${dateLabel(clinicalSessionTime(bundle,previous))} → ${dateLabel(clinicalSessionTime(bundle,latest))}): ${comparison}`,
    ['section:'+previousMse.id,'section:'+currentMse.id,...corrections.filter(c=>[currentMse.session_id,previousMse.session_id].includes(c.session_id!)).map(c=>c.id)],false,'documented');
  }
 }
 return {day,patient_id:bundle.patient.id,sources,layers:{durable,canonical,trajectory,corrections,archive:sources.filter(s=>s.kind==='session_section')},findings};
}

export type SummaryContext=ReturnType<typeof buildSummaryContext>;
export function minimumBriefingItems(context:SummaryContext){
 return new Set(context.sources.filter(s=>s.kind==='session_section').map(s=>s.session_id)).size>=2&&context.sources.filter(s=>s.kind==='session_section').length>=10?2:1;
}
// A useful record-derived briefing remains available without a model. Whole
// recorded sections retain date/source attribution; drafts and corrected parents
// cannot become current conclusions. The UI can collapse long evidence.
export function canonicalSummaryFindings(context:SummaryContext):Finding[]{
 const sections=context.sources.filter(s=>s.kind==='session_section');
 const latest=[...sections].sort((a,b)=>Date.parse(b.date||'')-Date.parse(a.date||''))[0]?.session_id;
 // Structured patches have already been applied to each source. Only narrative
 // corrections still require interpretation before repeating the parent text.
 const corrected=new Set(context.layers.corrections.filter(c=>c.kind==='addendum').map(c=>c.session_id));
 const selected=sections.filter(s=>s.session_id===latest&&!corrected.has(s.session_id));
 const additions:Finding[]=[];
 for(const source of selected){
  const suffix=source.label.split(' · ').pop();
  const category:Category|undefined=['Assessment','Interview','MSE','Λειτουργικότητα'].includes(suffix||'')?'Τρέχουσα εικόνα':['Πλάνο','Επανεκτίμηση'].includes(suffix||'')?'Πλάνο':undefined;
  if(!category)continue;
  const corrections=context.layers.corrections.filter(c=>c.kind==='structured_correction'&&c.session_id===source.session_id);
  additions.push({key:'record:'+source.id,label:category,text:source.label+(corrections.length?' — με τις καταγεγραμμένες διορθώσεις: ':' — καταγεγραμμένο: ')+String(source.content),source_ids:[source.id,...corrections.map(c=>c.id)],attention:false,origin:'documented'});
 }
 return [...context.findings,...additions];
}

export function validateNarrative(output:unknown,context:SummaryContext):Finding[]{
 if(!output||typeof output!=='object'||!('findings' in output)||!Array.isArray(output.findings))throw new Error('invalid_output');
 const list=output.findings;if(list.length<minimumBriefingItems(context)||list.length>8)throw new Error('invalid_count');
 return list.map((f:unknown,index)=>{
  if(!f||typeof f!=='object')throw new Error('invalid_finding');
  const item=f as {text:string;source_ids:string[];group_label?:string;theme?:SummaryTheme};
  if(typeof item.text!=='string'||item.text.trim().length<12||item.text.length>360||!Array.isArray(item.source_ids)||!item.source_ids.length||item.source_ids.length>5)throw new Error('invalid_finding');
  const group_label=typeof item.group_label==='string'&&item.group_label.trim().length>=2&&item.group_label.trim().length<=32?item.group_label.trim():'Γενική εικόνα';
  const theme=summaryThemes.includes(item.theme as SummaryTheme)?item.theme as SummaryTheme:'general';
  if(!/[.!?;…»”)]$/u.test(item.text.trim()))throw new Error('invalid_finding');
  if(/(ignore.{0,30}instruction|AUDIT_INJECTION|αγνόησε.{0,30}οδηγ)/iu.test(item.text))throw new Error('unsafe_text');
  if(item.source_ids.some(id=>typeof id!=='string')||new Set(item.source_ids).size!==item.source_ids.length)throw new Error('unsupported_source');
  const sources=item.source_ids.map(id=>context.sources.find(s=>s.id===id));
  if(sources.some(s=>!s))throw new Error('unsupported_source');
  const correctedSessions=new Set(context.layers.corrections.map(c=>c.session_id));
  for(const source of sources){
   if(source?.session_id&&['session_section','structured_risk'].includes(source.kind)&&correctedSessions.has(source.session_id)){
    const relevant=context.layers.corrections.filter(c=>c.session_id===source.session_id);
    if(relevant.some(c=>!item.source_ids.includes(c.id)))throw new Error('corrected_parent');
   }
   if(source?.kind==='medication_event'){
    const revisions=context.sources.filter(s=>s.kind==='medication_revision'&&s.record_id===source.record_id);
    if(revisions.some(r=>!item.source_ids.includes(r.id)))throw new Error('corrected_parent');
   }
  }
  return {key:'briefing:'+index,label:'Τρέχουσα εικόνα' as Category,text:item.text.trim(),source_ids:item.source_ids,attention:false,origin:'synthesis',group_label,theme};
 });
}
export function assertCriticalCoverage(final:Finding[],context:SummaryContext){
 const required=context.findings.filter(f=>f.attention);
 for(const expected of required){if(!final.some(f=>f.key===expected.key&&f.text===expected.text&&f.source_ids.join('|')===expected.source_ids.join('|')))throw new Error('critical_coverage_failed');}
}
