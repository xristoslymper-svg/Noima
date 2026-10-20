import {getTranslations} from 'next-intl/server';
import {bookingEnabled} from '@/lib/presence/booking';
import {notFound} from 'next/navigation';
import {presenceCall} from '@/lib/presence/hosted-server';
import {hostedEnabled} from '@/lib/presence/public-policy';
import PublicPractice from '@/components/presence/PublicPractice';
export const dynamic='force-dynamic';
export async function generateMetadata(){const t=await getTranslations();return {title:t('current.m360')+' · NOIMA',robots:{index:false,follow:false}}}
export default async function Page({params}:{params:Promise<{slug:string}>}){
 const t=await getTranslations();
if(!hostedEnabled(process.env))notFound();const {slug}=await params;const response=await presenceCall({action:'read',slug});if(response.status===404)notFound();if(!response.ok)return <main className="pilot-page"><section className="pilot-card"><h1>{t('current.m079')}</h1><p>{t('current.m080')}</p></section></main>;return <PublicPractice slug={slug} booking={bookingEnabled(process.env)} content={await response.json()}/>}
