import type {DocumentField,VisitDocument} from './visit-document';

// Previous selections are a visual reference until the clinician records them.
export function visibleMseField(field:DocumentField,previous?:DocumentField):DocumentField{
 return !field.review&&!field.text.trim()&&previous?{...field,text:previous.text}:field;
}
export function recordMseField(field:DocumentField,text:string,previous?:DocumentField):DocumentField{
 return {...field,text,...(previous?.reference?{reference:previous.reference}:{}),review:text.trim()?(previous&&text===previous.text?'unchanged':'changed'):'not_assessed'};
}
export function mseReviewCounts(document:VisitDocument,previous?:VisitDocument|null){
 const fields=document.fields.filter(f=>f.key!=='legacy');
 return {reviewed:fields.filter(f=>f.review||f.text.trim()).length,total:fields.length,changed:fields.filter(f=>f.text.trim()&&f.text!==(previous?.fields.find(p=>p.key===f.key)?.text||'')).length};
}
// One explicit action confirms only previously observed domains, never new normal findings.
export function confirmMseUnchanged(document:VisitDocument,previous:VisitDocument,includeEmpty=false):VisitDocument{
 const fields=document.fields.map(field=>{
  if(field.text.trim()||(field.review&&!(includeEmpty&&field.review==='not_assessed')))return field;
  const ref=previous.fields.find(p=>p.key===field.key&&p.text.trim()&&p.review!=='not_assessed');
  return ref?{...ref,review:'unchanged' as const}:field;
 });
 const legacy=previous.fields.find(f=>f.key==='legacy'&&f.text.trim());
 if(legacy&&!fields.some(f=>f.key==='legacy'))fields.push({...legacy,review:'unchanged'});
 return {...document,fields};
}
export function mseDeltas(previous:VisitDocument,current:VisitDocument){
 return current.fields.flatMap(field=>{
  const before=previous.fields.find(f=>f.key===field.key);
  // Missing observations never mean clinical improvement or resolution.
  if(field.key==='legacy'||!before?.text.trim()||!field.text.trim()||field.review==='not_assessed'||before.text===field.text)return [];
  return [{key:field.key,label:field.label,before:before.text,after:field.text}];
 });
}

// Empty domains stay empty, never normal or carried forward. At an explicit
// document save they receive the existing missing-assessment marker so a partial
// exam does not require one redundant skip click per untouched domain.
export function mseDocumentForSave(document:VisitDocument):VisitDocument{
 if(document.kind!=='mse')return document;
 return {...document,fields:document.fields.map(field=>
  field.key!=='legacy'&&!field.text.trim()&&!field.review
   ?{...field,review:'not_assessed' as const}:field)};
}
