'use client';
import {useTranslations} from 'next-intl';
import {usePathname} from 'next/navigation';
export default function PilotNotice({realData}:{realData:boolean}){
 const t=useTranslations('common'),path=usePathname();
 if(!realData&&['/assessment','/intake','/tablet'].includes(path))return null;
 return <><div className="fictional-pilot-notice">{t('pilotNotice')}</div>{realData&&<main className="record-state">{t('realDataUnavailable')}</main>}</>;
}
