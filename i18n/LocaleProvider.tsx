'use client';
import {createContext, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {NextIntlClientProvider, useTranslations} from 'next-intl';
import {clinicalTimeZone, type Locale} from './config';
import {loadMessages, type Messages} from './messages';

const LocaleContext = createContext<{locale: Locale; changeLocale: (locale: Locale) => Promise<void>; busy: boolean} | null>(null);
export function useLanguage() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('LocaleProvider is required');
  return value;
}
export const useT = useTranslations;
export default function LocaleProvider({initialLocale, initialMessages, children}: {initialLocale: Locale; initialMessages: Messages; children: ReactNode}) {
  const [state, setState] = useState({locale: initialLocale, messages: initialMessages});
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => { document.documentElement.lang = state.locale; }, [state.locale]);
  async function changeLocale(locale: Locale) {
    if (pending.current || locale === state.locale) return;
    pending.current = true; setBusy(true);
    try {
      const messages = await loadMessages(locale);
      const response = await fetch('/api/locale', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({locale})});
      const result = await response.json();
      if (!response.ok || result.locale !== locale) throw new Error('locale_save_failed');
      // Do not navigate, refresh, change a React key or touch any clinical draft state.
      setState({locale, messages});
    } finally { pending.current = false; setBusy(false); }
  }
  return <LocaleContext.Provider value={{locale: state.locale, changeLocale, busy}}><NextIntlClientProvider
    locale={state.locale} messages={state.messages} timeZone={clinicalTimeZone}
    onError={error => { if (process.env.NODE_ENV !== 'production') console.error('[i18n]', error.code, error.message); }}
    getMessageFallback={() => state.messages.common.translationUnavailable}
  >{children}</NextIntlClientProvider></LocaleContext.Provider>;
}

export function PilotNotice({realData}: {realData: boolean}) {
  const t = useTranslations('common');
  return <><div className="fictional-pilot-notice">{t('pilotNotice')}</div>{realData && <main className="record-state">{t('realDataUnavailable')}</main>}</>;
}
