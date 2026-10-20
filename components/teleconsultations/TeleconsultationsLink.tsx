import {useTranslations} from 'next-intl';
import Link from 'next/link';
import {Video} from 'lucide-react';
export default function TeleconsultationsLink(){
 const t=useTranslations();
return <Link href="/teleconsultations" className="nav-item"><Video size={19}/><span>{t('current.m268')}</span></Link>}
