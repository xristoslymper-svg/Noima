import type {DocumentField,VisitDocument} from './visit-document';
import {axisValues,mseAxes,mseNote} from './mse-options.ts';

const join=(values:string[])=>values.length<2?values.join(''):values.slice(0,-1).join(', ')+' και '+values.at(-1);
const lower=(text:string)=>text.toLocaleLowerCase('el');
const quoted=(text:string)=>'«'+text.trim()+'»';
const assessed=(field:DocumentField)=>field.review!=='not_assessed'&&Boolean(field.text.trim());
const moods:Record<string,string>={Ευθυμικό:'ευθυμικό συναίσθημα',Καταθλιπτικό:'καταθλιπτικό συναίσθημα',Αγχώδες:'αγχώδες συναίσθημα',Ευερέθιστο:'ευερεθιστότητα',Ανεβασμένο:'ανεβασμένο συναίσθημα'};

// Transform only recognized choice lines. Free text stays verbatim, including
// negation, uncertainty and timing; absent domains never acquire normal findings.
export function mseFieldSentence(field:DocumentField){
 if(!assessed(field))return '';
 const axes=mseAxes[field.key]||[];
 const values=(label:string)=>{const axis=axes.find(a=>a.label===label);return axis?axisValues(field.text,axis):[]};
 const parts:string[]=[];
 if(field.key==='mood'){
  const selected=values('Υποκειμενικό συναίσθημα');
  if(selected.length)parts.push('Καταγράφεται '+join(selected.map(v=>moods[v]))+'.');
 }else if(field.key==='speech'){
  const rhythm=values('Ρυθμός')[0],intensity=values('Ένταση')[0];
  const descriptors:string[]=[];
  if(rhythm)descriptors.push(lower(rhythm).replace(/ς$/u,'')+' ρυθμό');
  if(intensity)descriptors.push((intensity==='Συνήθης'?'συνήθη':lower(intensity))+' ένταση');
  if(descriptors.length)parts.push('Ο λόγος καταγράφεται με '+join(descriptors)+'.');
 }else if(field.key==='affect'){
  const range=values('Εύρος')[0];
  if(range)parts.push('Το εύρος της συναισθηματικής έκφρασης καταγράφεται ως '+lower(range)+'.');
 }
 const handled=field.key==='mood'?['Υποκειμενικό συναίσθημα']:field.key==='speech'?['Ρυθμός','Ένταση']:field.key==='affect'?['Εύρος']:[];
 for(const axis of axes.filter(a=>!handled.includes(a.label))){
  const selected=axisValues(field.text,axis);
  if(selected.length)parts.push('Στην καταγραφή για '+lower(axis.label)+' αναφέρεται '+quoted(join(selected))+'.');
 }
 const note=mseNote(field.text,field.key).trim();
 if(note)parts.push('Στην καταγραφή '+quoted(field.label||field.key)+' αναφέρεται: '+quoted(note)+'.');
 return parts.join(' ');
}

export function mseChangeSentences(current:VisitDocument,previous:VisitDocument,labels:Record<string,string>){
 return current.fields.flatMap(field=>{
  const old=previous.fields.find(f=>f.key===field.key);
  if(field.key==='legacy'||!assessed(field)||!old||!assessed(old)||field.text===old.text)return [];
  if(field.key==='mood'){
   const axis=mseAxes.mood[0],now=axisValues(field.text,axis),before=axisValues(old.text,axis);
   // Narrative edits need the exact comparison rather than choice-only wording.
   if(now.length&&before.length&&mseNote(field.text,'mood')===mseNote(old.text,'mood')){
    const kept=now.filter(v=>before.includes(v)),added=now.filter(v=>!before.includes(v)),removed=before.filter(v=>!now.includes(v));
    if(!added.length&&!removed.length)return [];
    const parts=[kept.length?'παραμένει καταγεγραμμένο '+join(kept.map(v=>moods[v])):'',added.length?'καταγράφεται πλέον '+join(added.map(v=>moods[v])):'',removed.length?'δεν καταγράφεται πλέον '+join(removed.map(v=>moods[v])):''].filter(Boolean);
    if(parts.length)return ['Σε σχέση με την προηγούμενη επίσκεψη, '+parts.join('· ')+'.'];
   }
  }
  return ['Σε σχέση με την προηγούμενη επίσκεψη, η καταγραφή για '+(labels[field.key]||field.label).toLocaleLowerCase('el')+' άλλαξε από '+quoted(old.text)+' σε '+quoted(field.text)+'.'];
 });
}
