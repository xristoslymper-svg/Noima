export type VisitLayout={order:string[];collapsed:string[];templates:{id:string;title:string}[]};
export const customSectionKey=(id:string)=>'custom:'+id;
export const isCustomSection=(key:string)=>/^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
export function customSectionContent(title:string,body:string){return title.trim()+'\n\n'+body;}
export function readCustomSection(content:string){const split=content.indexOf('\n\n');return split<0?{title:content.trim(),body:''}:{title:content.slice(0,split),body:content.slice(split+2)};}
export function normalizeVisitLayout(value:unknown):VisitLayout{
 const v=value&&typeof value==='object'?value as Partial<VisitLayout>:{};
 const unique=(a:unknown)=>Array.isArray(a)?[...new Set(a.filter((x):x is string=>typeof x==='string'&&x.length<100))].slice(0,64):[];
 const templates=Array.isArray(v.templates)?v.templates.filter(t=>t&&isCustomSection(t.id)&&typeof t.title==='string'&&t.title.trim().length>0&&t.title.length<=100).filter((t,i,a)=>a.findIndex(x=>x.id===t.id)===i).slice(0,20).map(t=>({id:t.id,title:t.title.trim()})):[];
 return {order:unique(v.order),collapsed:unique(v.collapsed),templates};
}
export function orderedVisitBlocks(ids:string[],layout:VisitLayout){return [...layout.order.filter(id=>ids.includes(id)),...ids.filter(id=>!layout.order.includes(id))];}
export function moveVisitBlock(ids:string[],id:string,target:string){const next=ids.filter(x=>x!==id);const at=next.indexOf(target);if(at<0)return ids;next.splice(at,0,id);return next;}
export function visitLayoutStorageKey(workspace:string,type:string){return 'noima:visit-layout:v1:'+workspace+':'+type;}
