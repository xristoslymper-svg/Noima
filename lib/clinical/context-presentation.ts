import type {continuityContexts} from './continuity-context.ts';
type Item=ReturnType<typeof continuityContexts>[number];
/** Exact text grouping for reading only. Every source retains its own revision/actions. */
export function groupContextSources(items:Item[]){
 const groups=new Map<string,Item[]>();
 for(const item of items){
  const key=item.content.trim().replace(/\s+/g,' ');
  const group=groups.get(key);
  if(group)group.push(item);else groups.set(key,[item]);
 }
 return [...groups.values()];
}
