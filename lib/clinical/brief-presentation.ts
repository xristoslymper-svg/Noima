import type {CardItem} from './clinical-card';
/** Whole statements only: overflow is disclosed, never silently truncated. */
export function briefPresentation(items:CardItem[],budget=120){
 const preview:CardItem[]=[],rest:CardItem[]=[];let words=0;
 for(const item of items){
  const text=item.text.trim();if(!text)continue;
  const count=text.split(/\s+/u).length;
  if(preview.length<4&&(words+count<=budget||!preview.length)){preview.push({...item,text});words+=count}
  else rest.push({...item,text});
 }
 return {preview,rest};
}
