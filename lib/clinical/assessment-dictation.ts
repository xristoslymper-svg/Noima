import type {VisitDocument} from './visit-document';

// Target the stable stored key, never a display label or array position.
export function appendAssessmentDictation(document:VisitDocument,fieldKey:string,transcript:string):VisitDocument {
 const text=transcript.trim();
 if(document.kind!=='assessment'||!text||!document.fields.some(field=>field.key===fieldKey))return document;
 return {...document,fields:document.fields.map(field=>field.key===fieldKey?{
  ...field,text:[field.text,text].filter(value=>value.trim()).join('\n'),
 }:field)};
}
