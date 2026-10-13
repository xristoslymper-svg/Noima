import Link from 'next/link';
import {Home,CalendarDays,Users,BookOpen} from 'lucide-react';
import {mobileV2Enabled} from './mobile-v2';
import styles from './MobileClinical.module.css';
export default function MobileClinicalNav({active}:{active:'overview'|'calendar'|'patients'|'library'}){
 if(!mobileV2Enabled)return null;
 return <nav className={styles.bottomNav} aria-label="Κύρια πλοήγηση κινητού">
  <Link href="/" aria-current={active==='overview'?'page':undefined}><Home size={20} aria-hidden="true"/><span>Επισκόπηση</span></Link>
  <Link href="/calendar" aria-current={active==='calendar'?'page':undefined}><CalendarDays size={20}/><span>Ημερολόγιο</span></Link>
  <Link href="/patients" aria-current={active==='patients'?'page':undefined}><Users size={20}/><span>Ασθενείς</span></Link>
  <Link href="/psychometrics" aria-current={active==='library'?'page':undefined}><BookOpen size={20} aria-hidden="true"/><span>Βιβλιοθήκη</span></Link>
 </nav>;
}
