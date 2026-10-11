/** Pure display helpers: no appointment mutations or inferred clinical state. */
export function agendaNeedsScroll(count:number){return count>=5;}
export function sortedAgenda<T extends {id:string;scheduled_start:string}>(events:readonly T[]):T[]{
  return [...events].sort((a,b)=>Date.parse(a.scheduled_start)-Date.parse(b.scheduled_start)||a.id.localeCompare(b.id));
}
