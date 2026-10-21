import type {CardItem} from './clinical-card';
/** Whole statements only: overflow is disclosed, never silently truncated. */
export function briefPresentation(items:CardItem[],budget=120){
 const preview:CardItem[]=[],rest:CardItem[]=[];let words=0;
 for(const item of items){
  const text=item.text.trim();if(!text)continue;
  const count=text.split(/\s+/u).length;
  if(preview.length<4&&words+count<=budget){preview.push({...item,text});words+=count}
  else rest.push({...item,text});
 }
 return {preview,rest};
}

/** Keep authoritative orientation beside the narrative; absence is not a denial. */
export function briefFacts(card:import('./clinical-card').ClinicalCard){
 const review=card.sources.filter(s=>s.kind==='session_section'&&s.section_key==='review'&&s.date===card.date);
 return {diagnoses:card.diagnoses,medications:card.medications,
 review:review.map(s=>({text:String(s.content),source_ids:[s.id,...(s.required_correction_ids||[])],date:s.date}))};
}
