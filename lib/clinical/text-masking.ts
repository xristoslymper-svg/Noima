// Deterministic outbound minimisation, not anonymisation or general-purpose NER.
// No network calls, persistence, logging, or cross-request replacement registry.
export type MaskIdentity={first_name?:string;last_name?:string;email?:string;phone?:string;landline?:string;contact_phone?:string;address?:string;amka?:string};
const variants:Record<string,string>={α:'αά',ε:'εέ',η:'ηή',ι:'ιίϊΐ',ο:'οό',υ:'υύϋΰ',ω:'ωώ',a:'aáàâä',e:'eéèêë',i:'iíìîï',o:'oóòôö',u:'uúùûü'};
const escape=(s:string)=>s.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&');
function pattern(value:string){
 return [...value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()].map(c=>/\s/u.test(c)?'\\s+':variants[c]?'['+variants[c]+']\\p{M}*':escape(c)+'\\p{M}*').join('');
}
export function createClinicalMasker(identity:MaskIdentity={},seed?:unknown){
 const entries:Array<{text:string;token:string}>=[];
 const add=(value:string|undefined,token:string)=>{const text=value?.trim();if(text&&text.length>=3&&!entries.some(e=>e.text===text)){const label=token==='[ΣΥΓΓΕΝΗΣ]'?'[ΣΥΓΓΕΝΗΣ_'+(entries.filter(e=>e.token.startsWith('[ΣΥΓΓΕΝΗΣ_')).length+1)+']':token;entries.push({text,token:label})}};
 add([identity.first_name,identity.last_name].filter(Boolean).join(' '),'[ΑΣΘΕΝΗΣ]');
 add(identity.first_name,'[ΑΣΘΕΝΗΣ]');add(identity.last_name,'[ΑΣΘΕΝΗΣ]');
 for(const key of ['email','phone','landline','contact_phone','address','amka'] as const)add(identity[key],'[ΣΤΟΙΧΕΙΟ_ΤΑΥΤΟΤΗΤΑΣ]');
 let terms:Array<{regex:RegExp;token:string}>=[];
 let replacements=0;
 const replace=(text:string,regex:RegExp,token:string)=>text.replace(regex,()=>{replacements++;return token});
 function text(raw:string){
  let s=raw.normalize('NFC');
  for(const term of terms)s=replace(s,term.regex,term.token);
  s=replace(s,/[A-Z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/giu,'[EMAIL]');
  s=replace(s,/(?:https?:\/\/|www\.)[^\s<>"\])]+/giu,'[ΣΥΝΔΕΣΜΟΣ]');
  s=replace(s,/(?<!\d)\+\d(?:[\s().-]*\d){6,14}(?!\d)/gu,'[ΤΗΛΕΦΩΝΟ]');
  s=s.replace(/(?<!\d)(?:\+?30[\s().-]*)?[2679](?:[\s().-]*\d){9}(?!\d)/gu,candidate=>{
   if(/\d{4}[-.]\d{2}[-.]\d{2}/u.test(candidate))return candidate;
   replacements++;return '[ΤΗΛΕΦΩΝΟ]';
  });
  s=replace(s,/(?<!\d)\d{11}(?!\d)/gu,'[ΑΜΚΑ]');
  s=replace(s,/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}\b/giu,'[IBAN]');
  s=replace(s,/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu,'[ΑΝΑΓΝΩΡΙΣΤΙΚΟ]');
  // Explicit labels stop at clause boundaries; preserve symptoms, dates and doses.
  s=s.replace(/((?:όνομα(?:τεπώνυμο)?|ονομα(?:τεπωνυμο)?|ασθενής|ασθενης|εργοδότης|εργοδοτης|εταιρεία|εταιρεια|διεύθυνση|διευθυνση|address|employer|name)\s*[:=]\s*)([^.;,\n!?]+)/giu,(_,label,value)=>{
   if(/^\s*\[/u.test(value))return label+value;
   replacements++;return label+'[ΣΤΟΙΧΕΙΟ_ΤΑΥΤΟΤΗΤΑΣ]';
  });
  s=s.replace(/((?:τηλ(?:έφωνο|εφωνο)?|phone|ΑΜΚΑ|AMKA|ΑΦΜ|AFM)\s*[:=]?\s*)([+\d][\d ()-]{5,})/giu,(_,label)=>{replacements++;return label+'[ΣΤΟΙΧΕΙΟ_ΤΑΥΤΟΤΗΤΑΣ]'});
  return s;
 }
 function visit<T>(value:T):T{
  if(typeof value==='string')return text(value) as T;
  if(Array.isArray(value))return value.map(visit) as T;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(item)])) as T;
  return value;
 }
 function mask<T>(value:T):T{
  // Learn explicitly labelled entities from the entire payload before replacing
  // any text, so earlier notes and later questions share the same local registry.
  const collect=(item:unknown)=>{
   if(typeof item==='string'){
    for(const match of item.matchAll(/(?:όνομα(?:τεπώνυμο)?|ονομα(?:τεπωνυμο)?|εργοδότης|εργοδοτης|εταιρεία|εταιρεια|διεύθυνση|διευθυνση|address|employer|name)\s*[:=]\s*([^.;,\n!?]+)/giu)){
     const entity=match[1].trim();if(entity.length<=120&&!entity.startsWith('['))add(entity,'[ΣΤΟΙΧΕΙΟ_ΤΑΥΤΟΤΗΤΑΣ]');
    }
    for(const match of item.matchAll(/(?:μητέρα|μητερα|πατέρας|πατερας|σύζυγος|συζυγος|αδελφός|αδελφος|αδελφή|αδελφη)\s*(?:της|του)?\s*[:,]?\s*(\p{Lu}[\p{L}\p{M}'-]+\s+\p{Lu}[\p{L}\p{M}'-]+)/gu))add(match[1],'[ΣΥΓΓΕΝΗΣ]');
   }else if(Array.isArray(item))item.forEach(collect);
   else if(item&&typeof item==='object')Object.values(item).forEach(collect);
  };
  collect(seed);collect(value);
  terms=entries.sort((a,b)=>b.text.length-a.text.length).map(e=>({regex:new RegExp('(?<![\\p{L}\\p{N}])'+pattern(e.text)+'(?:ς)?(?![\\p{L}\\p{N}])','giu'),token:e.token}));
  return visit(value);
 }
 return {mask,stats:()=>({replacements})};
}
export function maskProviderPayload<T>(value:T,identity:MaskIdentity={},seed?:unknown):T{return createClinicalMasker(identity,seed).mask(value)}
