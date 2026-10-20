'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useTranslations} from 'next-intl';
import PatientVisualIcon from './PatientVisualIcon';
import {Children,isValidElement,useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowDown,ArrowUp,ChevronDown,ChevronUp,GripVertical,Plus,SlidersHorizontal} from 'lucide-react';
import type {DemoSection,PatientBundle,DemoSession} from '@/lib/patients/demo-runtime';
async function saveCustom(body:Record<string,unknown>){const response=await fetch('/api/patients/demo/custom-section',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw new Error(value.error||'Δεν αποθηκεύτηκε η ενότητα.');return value;}
import {customSectionKey,isCustomSection,readCustomSection,normalizeVisitLayout,orderedVisitBlocks,moveVisitBlock,visitLayoutStorageKey,type VisitLayout} from '@/lib/clinical/visit-layout';
import {draftSaveStatus} from '@/lib/clinical/draft-save-status';
import {useClinicalDraft} from './useClinicalDraft';
import styles from './VisitCanvas.module.css';
type Shared={bundle:PatientBundle;session:DemoSession;reload:()=>Promise<unknown>;registerFlusher:(key:string,flush:()=>Promise<void>)=>(()=>void);onDirtyChange:(key:string,dirty:boolean)=>void};
const titles:Record<string,string>={notes:'Σημειώσεις επίσκεψης',interview:'Αναφορά ασθενούς',clinical:'Κλινική εικόνα & απόφαση',medication:'Αγωγή',mse:'Ψυχική κατάσταση (MSE)',risk:'Εκτίμηση κινδύνου',measures:'Ψυχομετρικές μετρήσεις',scores:'Ψυχομετρικές μετρήσεις',assessment:'Κλινική εκτίμηση',plan:'Πλάνο & επανέλεγχος',appointment:'Επόμενο ραντεβού',history:'Ιστορικό'};
const empty=()=>normalizeVisitLayout(null);
export default function VisitCanvas(p:Shared&{children:ReactNode;toolbarActions?:ReactNode;toolbarContext?:ReactNode}){
 const ui=useUiText();

 const t=useTranslations();

 const [layout,setLayout]=useState<VisitLayout>(empty),[ready,setReady]=useState(false),[editing,setEditing]=useState(false),[title,setTitle]=useState(''),[error,setError]=useState('');
 const dragging=useRef('');
 const storageKey=visitLayoutStorageKey(p.bundle.patient.tester_id,p.session.session_type);
 useEffect(()=>{try{setLayout(normalizeVisitLayout(JSON.parse(localStorage.getItem(storageKey)||'null')))}catch{setError('Η διάταξη δεν φορτώθηκε. Οι σημειώσεις δεν επηρεάζονται.')}setReady(true)},[storageKey]);
 function update(next:VisitLayout){const normalized=normalizeVisitLayout(next);setLayout(normalized);try{localStorage.setItem(storageKey,JSON.stringify(normalized));setError('')}catch{setError('Η διάταξη ισχύει προσωρινά. Δεν αποθηκεύτηκε σε αυτόν τον browser. Οι σημειώσεις αποθηκεύονται ξεχωριστά στην επίσκεψη.')}}
 const nodes=Children.toArray(p.children);
 const blocks=nodes.map((node,index)=>{
  const props=isValidElement(node)?node.props as Record<string,unknown>:{};
  const id=String(props['data-mobile-section']||props.anchor||props['data-visit-part']||'fixed:'+index);
  return {id,title:titles[id]||String(props.title||id),node,fixed:id.startsWith('fixed:')};
 });
 const saved=p.bundle.sections.filter(s=>s.session_id===p.session.id&&isCustomSection(s.section_key));
 const customIds=[...new Set([...saved.map(s=>s.section_key),...layout.templates.map(t=>t.id)])];
 const all=[...blocks,...customIds.map(id=>{const existing=saved.find(s=>s.section_key===id);const name=existing?readCustomSection(existing.content).title:layout.templates.find(t=>t.id===id)!.title;return {id,title:name,fixed:false,node:<CustomVisitSection key={id} {...p} sectionKey={id} title={name} existing={existing}/>}})];
 const order=orderedVisitBlocks(all.map(b=>b.id),layout);
 function move(id:string,target:string){update({...layout,order:moveVisitBlock(order,id,target)})}
 function add(){const name=title.trim();if(!name||name.length>100||layout.templates.length>=20)return;const id=customSectionKey(crypto.randomUUID());update({...layout,order:[...order,id],templates:[...layout.templates,{id,title:name}]});setTitle('')}
 return <div>
  <div className={styles.toolbar}>{p.toolbarContext&&<div className={styles.context}>{p.toolbarContext}</div>}<div className={styles.toolbarActions}>{p.toolbarActions}<button type="button" aria-pressed={editing} disabled={!ready} onClick={()=>setEditing(v=>!v)}><SlidersHorizontal size={15} aria-hidden="true"/> {editing?ui('Τέλος προσαρμογής'):ui('Προσαρμογή καταγραφής')}</button></div></div>
  {editing&&<p className={styles.hint}>{t('current.m240')}</p>}
  {error&&<p role="alert">{ui(error)}</p>}
  <div className={editing?styles.customizing:undefined}><div className={styles.blocks}>{order.map((id,index)=>{const block=all.find(b=>b.id===id)!;if(block.fixed)return <div key={id}>{block.node}</div>;const collapsed=layout.collapsed.includes(id);return <section className={styles.block} key={id} aria-label={ui('Ενότητα: ')+block.title} onDragOver={e=>{if(editing)e.preventDefault()}} onDrop={e=>{e.preventDefault();if(editing&&dragging.current&&dragging.current!==id)move(dragging.current,id);dragging.current=''}}>
   <div className={editing||collapsed?styles.tools:styles.quick}>
    {editing&&<><span className={styles.drag} draggable onDragStart={()=>{dragging.current=id}} onDragEnd={()=>{dragging.current=''}} aria-label={t('polish.m061')+block.title}><GripVertical size={16}/></span><strong>{block.title}</strong><button type="button" aria-label={ui('Μετακίνηση πάνω: ')+block.title} disabled={index===0} onClick={()=>move(id,order[index-1])}><ArrowUp size={14}/></button><button type="button" aria-label={ui('Μετακίνηση κάτω: ')+block.title} disabled={index===order.length-1} onClick={()=>{const next=[...order];[next[index],next[index+1]]=[next[index+1],next[index]];update({...layout,order:next})}}><ArrowDown size={14}/></button></>}
    {!editing&&collapsed&&<strong>{block.title}</strong>}
    <button type="button" aria-expanded={!collapsed} aria-label={(collapsed?ui('Ανάπτυξη: '):ui('Σύμπτυξη: '))+block.title} onClick={()=>update({...layout,collapsed:collapsed?layout.collapsed.filter(x=>x!==id):[...layout.collapsed,id]})}>{collapsed?<ChevronDown size={15}/>:<ChevronUp size={15}/>}</button>
   </div>
   <div hidden={collapsed}>{block.node}</div>
  </section>})}</div>
  {editing&&<aside className={styles.sidebar}><h3>{t('current.m241')}</h3><div className={styles.add}><label>{t('current.m242')}<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} placeholder={t('current.m248')}/></label><button type="button" disabled={!title.trim()||layout.templates.length>=20} onClick={add}><Plus size={15}/>{t('current.m241')}</button></div><p className={styles.hint}>{t('current.m243')}</p><button type="button" onClick={()=>update(empty())}>{t('current.m244')}</button><p className={styles.hint}>{t('current.m245')}</p></aside>}</div>
 </div>;
}
function CustomVisitSection(p:Shared&{sectionKey:string;title:string;existing?:DemoSection}){
 const ui=useUiText();

 const t=useTranslations();

 const base=p.existing?readCustomSection(p.existing.content):{title:p.title,body:''};
 const key='section:'+p.sectionKey;
 const draft=useClinicalDraft({storageKey:p.session.id+':'+key,initial:base.body,version:p.existing?.version??null,write:async(content,version)=>{const result=await saveCustom({action:'save_custom_section',session_id:p.session.id,section_key:p.sectionKey,title:base.title,content,expected_version:version});return {value:readCustomSection(result.section.content).body,version:result.section.version}},onSaved:p.reload,onDirty:dirty=>p.onDirtyChange(key,dirty)});
 const [comparison,setComparison]=useState<DemoSection|null|undefined>();
 useEffect(()=>p.registerFlusher(key,draft.flush),[p.registerFlusher,key,draft.flush]);
 return <div className={styles.custom}><label>{base.title}<textarea rows={4} maxLength={20000} value={draft.value} placeholder={t('current.m249')} onChange={e=>draft.change(e.target.value)} onBlur={()=>void draft.flush().catch(()=>{})}/></label><p role="status">{draftSaveStatus({saving:draft.saving,dirty:draft.dirty,error:draft.error,savedAt:draft.savedAt,recorded:Boolean(p.existing)})}</p>{draft.error&&<><button type="button" onClick={()=>void draft.flush().catch(()=>{})}>{t('visits.retrySave')}</button><button type="button" onClick={()=>void p.reload().then(b=>setComparison((b as PatientBundle).sections.find(s=>s.session_id===p.session.id&&s.section_key===p.sectionKey)||null))}>{t('visits.compareSaved')}</button></>}{comparison!==undefined&&<div className="conflict-review"><p>{t('current.m246')}</p><p className={styles.read}>{comparison?readCustomSection(comparison.content).body:ui('Κενή ενότητα')}</p><button type="button" onClick={()=>{draft.resolve(draft.currentValue(),comparison?readCustomSection(comparison.content).body:'',comparison?.version??null);setComparison(undefined)}}>{t('current.m247')}</button><button type="button" onClick={()=>{draft.acceptServerPreservingLocal(comparison?readCustomSection(comparison.content).body:'',comparison?.version??null);setComparison(undefined)}}>{t('current.m069')}</button></div>}</div>;
}
export function CustomVisitSectionsRead({bundle,sessionId}:{bundle:PatientBundle;sessionId:string}){
 const ui=useUiText();
return <>{bundle.sections.filter(s=>s.session_id===sessionId&&isCustomSection(s.section_key)).map(s=>{const value=readCustomSection(s.content);return <section className="visit-part" key={s.id}><header><h3><PatientVisualIcon name="notes"/>{value.title}</h3></header><p className={styles.read}>{value.body||ui('Δεν έχει καταγραφεί κείμενο.')}</p></section>})}</>}
