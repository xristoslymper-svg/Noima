import type {DiagnosisCode} from './visit-document';
export const WHO_ICD10_ROOT='https://icd.who.int/browse10/2019/en';
function plain(value:string){return value.replace(/<[^>]*>/g,'').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim()}
export function parseWhoSearch(html:string):DiagnosisCode[]{
 const found=new Map<string,DiagnosisCode>();
 for(const match of html.matchAll(/data-stemid="http:\/\/id\.who\.int\/icd\/release\/10\/2019\/([A-Z]\d{2}(?:\.[0-9A-Z]+)?)"[\s\S]*?class="titlelabel[^"]*">([\s\S]*?)<\/span>/g)){
  const label=plain(match[2]);if(label)found.set(match[1],{code:match[1],label,system:'WHO ICD-10',edition:'2019'});
 }
 return [...found.values()];
}
