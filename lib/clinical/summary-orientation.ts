import type {PatientBundle} from '../patients/demo-runtime';
import type {ClinicalCard,CardItem} from './clinical-card';
import type {SummaryContext,Finding,Evidence} from './summary-context';

export type OrientationRow={label:string;items:CardItem[];history?:CardItem[];empty:string};
const refs=(s:Evidence,context:SummaryContext)=>[...new Set([s.id,...(s.required_correction_ids||[]),...context.layers.corrections.filter(c=>c.kind==='addendum'&&c.session_id===s.session_id).map(c=>c.id)])];
const dated=(s:Evidence,context:SummaryContext):CardItem=>({text:(s.date?s.date.slice(0,10)+' · ':'')+String(s.content),source_ids:refs(s,context)});
// Interpret only an explicit numeric review interval; preserve the original instruction.
export function reviewWindow(text:string,visitDate:string,day:string):string{
 const matches=[...text.matchAll(/(?:επανεκτίμηση|επανεξέταση|πλάνο επανελέγχου)\s+σε\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s+εβδομάδες/giu)];
 if(matches.length!==1||/(?:^|\s)(?:αν|εφόσον|ανάλογα|ίσως)(?:\s|$)/iu.test(text))return '';
 const low=Number(matches[0][1]),high=Number(matches[0][2]||low);
 const start=Date.parse(visitDate.slice(0,10)+'T12:00:00Z'),now=Date.parse(day+'T12:00:00Z');
 if(!Number.isFinite(start)||!Number.isFinite(now)||low<1||high<low||high>52)return '';
 const from=start+low*7*86400000,to=start+high*7*86400000;
 const date=(value:number)=>new Date(value).toISOString().slice(0,10).spli���q�^