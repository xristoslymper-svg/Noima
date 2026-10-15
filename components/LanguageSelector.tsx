'use client';
import {useId, useState} from 'react';
import {useTranslations} from 'next-intl';
import {isLocale, locales, localeNames} from '@/i18n/config';
import {useLanguage} from '@/i18n/LocaleProvider';
export default function LanguageSelector({compact = false}: {compact?: boolean}) {
  const t = useTranslations('settings'), {locale, changeLocale, busy} = useLanguage();
  const id = useId(), [status, setStatus] = useState<'saved' | 'failed' | ''>('');
  return <div className={`language-setting${compact ? ' language-setting-compact' : ''}`}>
    <label htmlFor={id}>{t('language')}</label>
    <select id={id} value={locale} disabled={busy} aria-describedby={compact ? undefined : `${id}-help`} onChange={event => {
      const value = event.target.value;
      if (!isLocale(value)) return;
      setStatus(''); void changeLocale(value).then(() => setStatus('saved')).catch(() => setStatus('failed'));
    }}>{locales.map(value => <option key={value} value={value} lang={value}>{localeNames[value]}</option>)}</select>
    {!compact && <small id={`${id}-help`}>{t('languageHelp')}</small>}
    <span role={status === 'failed' ? 'alert' : 'status'} aria-live="polite">{busy ? t('languageSaving') : status === 'saved' ? t('languageSaved') : status === 'failed' ? t('languageFailed') : ''}</span>
  </div>;
}
