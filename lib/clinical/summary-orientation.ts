import type {PatientBundle} from '../patients/demo-runtime';
import type {ClinicalCard,CardItem} from './clinical-card';
import type {SummaryContext,Finding,Evidence} from './summary-context';

export type OrientationRow={label:string;items:CardItem[];history?:CardItem[];empty:string};
const refs=(s:Evidence,context:SummaryContext)=>[...new Set([s.id,...(s.required_correction_ids||[]),...context.layers.corrections.filter(c=>c.kind==='addendum'&&c.session_id===s.session_id).map(c=>c.id)])];
const dated=(s:Evidence,context:SummaryContext):CardItem=>({text:(s.date?s.date.slice(0,10)+' · ':'')+String(s.content),source_ids:refs(s,context)});
// Dates describe documented prescribing, not verified ingestion or adherence.
export function medicationTiming(start:string,current:string,day:string){
 const duration=(value:string)=>{const days=Math.floor((Date.parse(day+'T12:00:00Z')-Date.parse(value.slice(0,10)+'T12:00:00Z'))/86400000);return Number.isFinite(days)&&days>=0?' ('+days+' ημέρες)':''};
 return [start&&start.slice(0,10)<=day?'έναρξη '+start.slice(0,10)+duration(start):'',current&&current.slice(0,10)<=day?'τρέχον σχήμα από '+current.slice(0,10)+duration(current):''].filter(Boolean).join(' · ');
}
export function buildSummaryOrientation(bundle:PatientBundle,context:SummaryContext,card:Pick<ClinicalCard,'diagnoses'|'medications'|'briefing'>,findings:Finding[],synthesized:boolean):OrientationRow[]{
 const narrative=(themes:string[])=>synthesized?findings.filter(f=>f.origin==='synthesis'&&themes.includes(f.theme||'general')).map(f=>({text:f.text,source_ids:f.source_ids})):[];
 const corrected=new Set(context.layers.corrections.filter(c=>c.kind==='addendum').map(c=>c.session_id));
 const sections=context.sources.filter(s=>s.kind==='session_section'&&!corrected.has(s.session_id)&&typeof s.content==='string'&&s.content.trim()).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||a.id.localeCompare(b.id));
 const reports=sections.filter(s=>['interview','functioning'].includes(s.section_key||''));
 const reportDates=[...new Set(reports.map(s=>s.date))];
 const anchors=reports.filter(s=>s.date===reportDates[0]||s.date===reportDates.at(-1));
 const latest=bundle.sessions.filter(s=>s.status==='completed').sort((a,b)=>b.started_at.localeCompare(a.started_at))[0];
 const plans=sections.filter(s=>['plan','review'].includes(s.section_key||''));
 const currentPlans=plans.filter(s=>s.session_id===latest?.id);
 const contextItems=card.briefing?.context||[];
 const historyItems=card.briefing?.history||[];
 const responseSections=sections.filter(s=>['adherence','effects'].includes(s.section_key||''));
 const currentResponse=responseSections.filter(s=>s.session_id===latest?.id);
 const timing=card.medications.map(item=>{const med=bundle.medications.find(m=>item.source_ids.includes('medication:'+m.id));const dates=med?medicationTiming(med.started_at,med.effective_from,context.day):'';return {...item,text:item.text+(dates?' · '+dates:'')};});
 return [
  {label:'Κλινική εικόνα',items:card.diagnoses.length?card.diagnoses:sections.filter(s=>s.section_key==='assessment').slice(-1).map(s=>dated(s,context)),empty:'Δεν έχει καταγραφεί δομημένη διάγνωση ή διαφορική διάγνωση.'},
  {label:'Πορεία',items:narrative(['course','general','psychometrics']).length?narrative(['course','general','psychometrics']):anchors.map(s=>dated(s,context)),history:synthesized?[]:reports.filter(s=>!anchors.includes(s)).map(s=>dated(s,context)),empty:'Δεν υπάρχουν διαθέσιμες καταγραφές πορείας.'},
  {label:'Θεραπεία & ανταπόκριση',items:[...timing,...(narrative(['medication']).length?narrative(['medication']):currentResponse.map(s=>dated(s,context)))],history:responseSections.filter(s=>s.session_id!==latest?.id).map(s=>dated(s,context)),empty:'Δεν υπάρχει καταγεγραμμένη ενεργή αγωγή ή ανταπόκριση.'},
  {label:'Σημαντικό πλαίσιο',items:[...contextItems,...narrative(['context','risk'])],history:historyItems,empty:'Δεν έχει καταγραφεί επιβεβαιωμένο ενεργό πλαίσιο. Δείτε το καταγεγραμμένο ιστορικό παρακάτω και τις επισκέψεις στην Πορεία.'},
  {label:'Επόμενη επανεκτίμηση',items:currentPlans.map(s=>dated(s,context)),history:plans.filter(s=>s.session_id!==latest?.id).reverse().map(s=>dated(s,context)),empty:'Δεν έχει καταγραφεί πλάνο στην τελευταία ολοκληρωμένη επίσκεψη. Οι παλαιότερες οδηγίες δεν θεωρούνται αυτομάτως εκκρεμείς.'},
 ];
}
