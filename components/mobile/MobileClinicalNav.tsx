
import {useTranslations} from 'next-intl';
import Link from 'next/link';
import {Home,CalendarDays,Users,BookOpen} from 'lucide-react';
import {mobileV2Enabled} from './mobile-v2';
import styles from './MobileClinical.module.css';
export default function MobileClinicalNav({active}:{active:'overview'|'calendar'|'patients'|'library'}){
 const t=useTranslations();

 if(!mobileV2Enabled)return null;
 return <nav className={styles.bottomNav} aria-label={t('accessibility.mobileNavigation')}>
  <Link href="/" aria-current={active==='overview'?'page':undefined}><Home size={20} aria-hidden="true"/><span>{t('navigation.overview')}</span></Link>
  <Link href="/calendar" aria-current={active==='calendar'?'page':undefined}><CalendarDays size={20}/><span>{t('navigation.calendar')}</span></Link>
  <Link href="/patients" aria-current={active==='patients'?'page':undefined}><Users size={20}/><span>{t('navigation.patients')}</span></Link>
  <Link href="/psychometrics" aria-current={active==='library'?'page':undefined}><BookOpen size={20} aria-hidden="true"/><span>{t('navigation.library')}</span></Link>
 </nav>;
}
