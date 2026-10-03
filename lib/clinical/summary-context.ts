import type {PatientBundle} from '../patients/demo-runtime';

export const SUMMARY_POLICY_VERSION=2;
export const categories=['Τρέχουσα εικόνα','Πορεία','Κίνδυνος','Αγωγή','Παρενέργειες','Ψυχομετρικά','Πλάνο','Χρειάζεται επιβεβαίωση','Σημαντικό ιστορικό'] as const;
export type Category=typeof categories[number];
export type Evidence={id:string;kind:string;label:string;date?:string;session_id?:string;content:unknown;target:'sessions'|'medications'|'psychometrics'|'history'|'calendar';record_id:string};
export type Finding={key:string;label:Category;text:string;source_ids:string[];attention:boolean;origin:'canonical'|'documented'|'synthesis'};
const names:Record<string,string>={interview:'Interview',mse:'MSE',assessment:'Assessment',plan:'Πλάνο',review:'Επανεκτίμηση',effects:'Παρενέργειες',functioning:'Λειτουργικότητα',adherence:'Λήψη αγωγής'};
const riskNames:Record<string,string>={suicidal_ideation:'Ιδεασμός',intent:'Πρόθεση',plan:'Σχέδιο',self_harm:'Αυτοτραυματισμός',attempt_history:'Ιστορικό απόπειρας'};
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
 if(risk){const values=Object.keys(riskNames).map(k=>`${riskNames[k]}: ${states[String(risk[k as keyof typeof risk])]||'δεν καταγράφηκε'}`);push('risk','Κίνδυνος',`Δομημένη εκτίμηση ${dateLabel(latest.completed_at!)}: ${values.join(' · ')}. Δεν υποκαθιστά σημερινή εκτίμηση.`,['risk:'+latest.id],Object.keys(riskNames).some(k=>risk[k as keyof typeof risk]!=='negative'));}
 else push('risk-missing','Κίνδυνος','Δεν υπάρχει ολοκληρωμένη δομημένη εκτίμηση κινδύνου. Το κενό δεν σημαίνει αρνητικό εύρημα.',[],true);
 for(const med of bundle.medications)push('med:'+med.id,'Αγωγή',`${med.medication_name}: ${medStates[med.status]||med.status} · ${med.dose} ${med.unit} · ${med.frequency} · έναρξη ${med.started_at}${med.ended_at?' · διακοπή '+med.ended_at:''}.`,['medication:'+med.id]);
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
  if(!r||['negative','unknown','not_assessed'].includes(r.suicidal_ideation))push('risk-review:'+s.id,'Χρειάζεται επιβεβαίωση','Η αφηγηματική καταγραφή αναφέρεται σε κίνδυνο ενώ η δομημένη ένδειξη είναι αρνητική, άγνωστη ή μη διερευνημένη. Ελέγξτε χρόνο, άρνηση και συμφωνία των πηγών· δεν έγινε αυτόματη συμφιλίωση.',[s.id,...(r?['risk:'+r.session_id]:[]),...corrections.filter(c=>c.session_id===s.session_id).map(c=>c.id)],true);
 }
 for(const s of trajectory){if(correctedParents.has(s.session_id!))continue;for(const med of bundle.medications){if(String(s.content).toLocaleLowerCase().includes(med.medication_name.toLocaleLowerCase()))push('med-review:'+s.id+':'+med.id,'Χρειάζεται επιβεβαίωση',`Η συνεδρία αναφέρει ${med.medication_name} ενώ η σημερινή δομημένη κατάσταση είναι «${medStates[med.status]||med.status}». Ελέγξτε αν πρόκειται για ιστορική ή τρέχουσα αναφορά· η καταγραφή δεν άλλαξε αυτόματα την αγωγή.`,[s.id,'medication:'+med.id],true);}}
 if(bundle.history)for(const [field,title] of [['allergies','Αλλεργίες'],['psychiatric_history','Ψυχιατρικό ιστορικό'],['medical_history','Ιατρικό ιστορικό'],['previous_treatments','Προηγούμενες θεραπείες'],['hospitalizations','Νοσηλείες'],['family_history','Οικογενειακό ιστορικό'],['substance_history','Ουσίες'],['social_functioning','Λειτουργικότητα']]){const value=bundle.history[field as keyof typeof bundle.history];if(typeof value==='string'&&value.trim())push('history:'+field,'Σημαντικό ιστορικό',`${title} — καταγεγραμμένο ιστορικό: ${value}`,['history:'+bundle.patient.id],field==='allergies');}
 return {day,patient_id:bundle.patient.id,sources,layers:{durable,canonical,trajectory,corrections,archive:sources.filter(s=>s.kind==='session_section')},findings};
}

export type SummaryContext=ReturnType<typeof buildSummaryContext>;
export function validateNarrative(output:unknown,context:SummaryContext):Finding[]{
 if(!output||typeof output!=='object'||!('findings' in output)||!Array.isArray(output.findings))throw new Error('invalid_output');
 const list=output.findings;if(list.length>5)throw new Error('invalid_count');
 const used=new Set<string>();
 return list.map((f:unknown,index)=>{
  if(!f||typeof f!=='object')throw new Error('invalid_finding');
  const item=f as {label:string;quotes:{source_id:string;quote:string}[]};
  if(!['Τρέχουσα εικόνα','Πορεία','Πλάνο'].includes(item.label)||used.has(item.label)||!Array.isArray(item.quotes)||!item.quotes.length||item.quotes.length>4)throw new Error('invalid_category');used.add(item.label);
  const texts=item.quotes.map(q=>{
   const s=context.sources.find(s=>s.id===q.source_id);if(!s||s.kind!=='session_section'||typeof q.quote!=='string'||q.quote.length<8||q.quote.length>600||!String(s.content).includes(q.quote))throw new Error('unsupported_quote');
   const segments=Array.from(new Intl.Segmenter('el',{granularity:'sentence'}).segment(String(s.content)),x=>x.segment.trim()).filter(Boolean);
   const isComplete=segments.some((_,start)=>segments.slice(start).some((__,end)=>segments.slice(start,start+end+1).join(' ')===q.quote.trim()));
   if(!isComplete||/(PHQ|GAD|λήμμα\s*9|item\s*9|ignore.{0,30}instruction|AUDIT_INJECTION|αγνόησε.{0,30}οδηγ)/iu.test(q.quote))throw new Error('unsafe_quote');
   if(context.layers.corrections.some(c=>c.session_id===s.session_id))throw new Error('corrected_parent');
   // No quote can be reworded into an authoritative state assertion. Explicit
   // attribution and timestamp apply to the entire verbatim quotation.
   return `${dateLabel(s.date)} · ${names[contextSectionKey(s.label)]||s.label}: «${q.quote}»`;
  });
  return {key:'narrative:'+index,label:item.label as Category,text:'Καταγεγραμμένη αφήγηση — '+texts.join(' / '),source_ids:item.quotes.map(q=>q.source_id),attention:false,origin:'synthesis'};
 });
}
function contextSectionKey(label:string){return label.split(' · ').pop()||label;}
export function assertCriticalCoverage(final:Finding[],context:SummaryContext){
 const required=context.findings.filter(f=>f.attention||f.label==='Αγωγή'||f.label==='Ψυχομετρικά'||f.label==='Παρενέργειες');
 for(const expected of required){if(!final.some(f=>f.key===expected.key&&f.text===expected.text&&f.source_ids.join('|')===expected.source_ids.join('|')))throw new Error('critical_coverage_failed');}
}
