'use client';
import {useUiText} from '@/i18n/use-ui-text';
import {useTranslations} from 'next-intl';
import type {Practice,SectionId} from '@/lib/presence/model';
import {titles} from '@/lib/presence/model';
import {MapPin,Phone,Clock,Video,CalendarDays} from 'lucide-react';
import styles from './Presence.module.css';
import {PublicArticles} from './Articles';
import {initials} from '@/lib/presence/content';
import type {Article} from '@/lib/presence/articles';
export default function PracticePage({practice,selected,onRequest,articles=[],hosted=false}:{hosted?:boolean;articles?:Article[];practice:Practice;selected?:SectionId;onRequest?:()=>void}){
 const ui=useUiText();

 const t=useTranslations();

 return <article className={styles.publicPage} aria-label={t('current.m254')}><div className={styles.publicBrand}><span>Ψ</span><strong>NOIMA</strong><small>{t('current.m250')}</small></div>{practice.order.filter(id=>practice.visible[id]).map(id=><section key={id} className={selected===id?styles.highlight:''} aria-label={ui(titles[id])}>
 {selected===id&&<small className={styles.selectedLabel}>{t('polish.m072')} {ui(titles[id])}</small>}
 {id==='intro'?<><div className={styles.identity}><div className={styles.avatar} style={practice.photo?{backgroundImage:'url('+practice.photo+')'}:{}} role="img" aria-label={t('current.m255')}>{practice.photo?'':initials(practice.name)}</div><div><h2>{practice.name||ui('Το όνομά σας')}</h2><p>{practice.specialty}</p></div></div><div className={styles.badges}><span><MapPin size={12}/>{t('polish.m073')}{practice.city?' · '+practice.city:''}</span>{practice.online&&<span><Video size={12}/>Online</span>}</div><p>{practice.welcome}</p></>:id==='contact'?<><h3>{t('current.m251')}</h3><p>{t('current.m252')}</p><button type="button" className="record compact" onClick={onRequest} disabled={!onRequest}><CalendarDays size={15}/>{t('current.m253')}</button><div className={styles.contact}><span><Phone size={14}/>{practice.phone}</span><span>{practice.email}</span><span><Clock size={14}/>{practice.hours}</span></div></>:id==='services'?<><h3>{ui(titles[id])}</h3><div className={styles.serviceItems}>{practice.serviceItems.filter(x=>x.title.trim()).map((x,i)=><div key={i}><h4>{x.title}</h4>{x.description&&<p>{x.description}</p>}</div>)}</div></>:id==='faq'?<><h3>{ui(titles[id])}</h3>{practice.faqItems.filter(x=>x.question.trim()).map((x,i)=><details key={i} className={styles.faqItem}><summary>{x.question}</summary><p className={styles.preserve}>{x.answer}</p></details>)}</>:<><h3>{ui(titles[id])}</h3><p className={styles.preserve}>{practice[id]}</p></>}
 </section>)}<PublicArticles articles={articles}/><footer>{hosted?t('polish.m074'):t('polish.m075')}</footer></article>
}
