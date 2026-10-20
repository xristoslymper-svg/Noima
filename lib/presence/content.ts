export type ServiceItem={title:string;description:string};
export type FaqItem={question:string;answer:string};
export function initials(name:string){const words=name.trim().split(/\s+/).filter(w=>!/^δρ\.?$/i.test(w)&&!/^dr\.?$/i.test(w));return words.slice(0,2).map(w=>Array.from(w)[0]||'').join('').toLocaleUpperCase('el-GR')||'Ι'}
export function legacyServices(value:string):ServiceItem[]{return value.split('\n').map(s=>s.trim()).filter(Boolean).map(title=>({title,description:''}))}
export function legacyFaq(value:string):FaqItem[]{if(!value.trim())return [];return value.split(/\n\s*\n/).filter(Boolean).map(block=>{const [question,...answer]=block.split('\n');return {question:question.trim(),answer:answer.join('\n').trim()}})}
export function validServices(value:unknown):value is ServiceItem[]{return Array.isArray(value)&&value.length<=30&&value.every(x=>x&&typeof x.title==='string'&&x.title.length<=2000&&typeof x.description==='string'&&x.description.length<=2000)}
export function validFaq(value:unknown):value is FaqItem[]{return Array.isArray(value)&&value.length<=30&&value.every(x=>x&&typeof x.question==='string'&&x.question.length<=2000&&typeof x.answer==='string'&&x.answer.length<=2000)}
export function serviceText(items:ServiceItem[]){return items.map(x=>[x.title,x.description].filter(Boolean).join('\n')).join('\n\n')}
export function faqText(items:FaqItem[]){return items.map(x=>[x.question,x.answer].filter(Boolean).join('\n')).join('\n\n')}
