import {useTranslations} from 'next-intl';
import GoogleCalendarPreview from '@/components/calendar/GoogleCalendarPreview';
import Link from 'next/link';
export default function Page(){
 const t=useTranslations();
return <main className="pilot-page"><section className="pilot-card pilot-account"><Link href="/calendar">{t('current.m077')}</Link><h1>{t('current.m078')}</h1><GoogleCalendarPreview/></section></main>}
