'use client';
import {useId, useState} from 'react';
import {useTranslations} from 'next-intl';
import {isLocale, locales, localeNames, type Locale} from '@/i18n/config';
import {useLanguage} from '@/i18n/LocaleProvider';

function LanguageFlag({locale}:{locale:Locale}){
  return locale==='el'?<svg viewBox="0 0 27 18" aria-hidden="true"><rect width="27" height="18" fill="#0d5eaf"/><path d="M0 3h27M0 7h27M0 11h27M0 15h27" stroke="#fff" strokeWidth="2"/><path fill="#0d5eaf" d="M0 0h10v10H0z"/><path d="M5 0v10M0 5h10" stroke="#fff" strokeWidth="2"/></svg>:<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#012169"/><path d="m0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4"/><path d="m0 0 30 20M30 0 0 20" stroke="#c8102e" strokeWidth="1.5"/><path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="7"/><path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="4"/></svg>;
}
export default function LanguageSelector({compact = false}: {compact?: boolean}) {
  const t = useTranslations('settings'), {locale, changeLocale, busy} = useLanguage();
  const id = useId(), [status, setStatus] = useState<'saved' | 'failed' | ''>('');
  function change(value:Locale){
    if(value===locale||busy)return;
    setStatus('');void changeLocale(value).then(()=>setStatus('saved')).catch(()=>setStatus('failed'));
  }
  return <div className={`language-setting${compact ? ' language-setting-compact' : ''}`}>
    {compact?<div className="login-language-buttons" role="group" aria-label={t('language')}>
      {locales.map(value=><button key={value} type="button" lang={value} aria-label={localeNames[value]} title={localeNames[value]} aria-pressed={locale===value} disabled={busy} onClick={()=>change(value)}><LanguageFlag locale={value}/><span aria-hidden="true">{value==='el'?'GR':'ENG'}</span></button>)}
    </div>:<><label htmlFor={id}>{t('language')}</label>
    <select id={id} value={locale} disabled={busy} aria-describedby={compact ? undefined : `${id}-help`} onChange={event => {
      const value = event.target.value;
      if (!isLocale(value)) return;
      change(value);
    }}>{locales.map(value => <option key={value} value={value} lang={value}>{localeNames[value]}</option>)}</select>
    <small id={`${id}-help`}>{t('languageHelp')}</small></>}
    <span role={status === 'failed' ? 'alert' : 'status'} aria-live="polite">{busy ? t('languageSaving') : status === 'saved' ? t('languageSaved') : status === 'failed' ? t('languageFailed') : ''}</span>
  </div>;
}
