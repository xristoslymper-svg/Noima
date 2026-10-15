'use client';
import Link from 'next/link';
import {useRef} from 'react';
import {Settings} from 'lucide-react';
import {useTranslations} from 'next-intl';
import LanguageSelector from '@/components/LanguageSelector';
import {useAccountSession} from '@/components/AccountSessionBoundary';

export default function PilotProfile({compact=false}:{compact?:boolean}){
 const account=useAccountSession(), t=useTranslations(), dialog=useRef<HTMLDialogElement>(null);
 const name=account?.identity?.full_name||t('settings.workspace');
 return <><button type="button" className={compact?'profile-compact':'profile'} onClick={()=>dialog.current?.showModal()} aria-label={t('settings.profile')} aria-haspopup="dialog">
  {compact?<Settings size={18} aria-hidden="true"/>:<>
  <div className="avatar">{name.split(/\s+/).slice(0,2).map(s=>s[0]).join('')}</div>
  <div className="profile-copy"><strong>{name}</strong><span>{account?.email||t('settings.privateWorkspace')}</span></div>
  <span className="pilot-badge">DEMO</span>
  </>}
 </button><dialog ref={dialog} className="profile-settings-dialog" aria-label={t('settings.title')}>
   <div className="profile-settings-heading"><h2>{t('settings.title')}</h2><button type="button" onClick={()=>dialog.current?.close()} aria-label={t('common.close')}>×</button></div>
   <LanguageSelector/><Link href="/account">{t('settings.account')}</Link>
 </dialog></>;
}
