'use client';
import {createContext,useContext,useEffect,useId,useState,type ReactNode} from 'react';
import {NextIntlClientProvider,useTranslations} from 'next-intl';
import {clinicalTimeZone,isLocale,languageNames,locales,type Locale} from './config';
import {loadMessages,type Messages} from './messages';

// Recipient presentation is independent of the signed-in clinician's preference.
// The URL describes presentation only; the token and canonical answer values do
// not change. No account preference, instrument version or clinical row is written.
export default function DocumentLocaleProvider({locale,messages,children}:{locale:Locale;messages:Messages;children:ReactNode}){
 const [state,setState]=useState({locale,messages}),[busy,setBusy]=useState(false);
 useEffect(()=>{document.documentElement.lang=state.locale},[state.locale]);
 async function change(next:Locale){if(busy||next===state.locale)return;setBusy(true);try{
  const messages=await loadMessages(next);setState({locale:next,messages});
  const url=new URL(location.href);url.searchParams.set('lang',next);history.replaceState(history.state,'',url);
 }finally{setBusy(false)}}
 return <DocumentLanguage.Provider value={{locale:state.locale,busy,change}}><NextIntlClientProvider locale={state.locale} messages={state.messages} timeZone={clinicalTimeZone} getMessageFallback={()=>state.messages.common.translationUnavailable}><div lang={state.locale} data-document-locale={state.locale}><DocumentLanguageSelector/>{children}</div></NextIntlClientProvider></DocumentLanguage.Provider>;
}
const DocumentLanguage=createContext<{locale:Locale;busy:boolean;change:(locale:Locale)=>Promise<void>}|null>(null);
function DocumentLanguageSelector(){
 const state=useContext(DocumentLanguage)!,t=useTranslations(),id=useId();
 const [error,setError]=useState(false);
 return <><div className="fictional-pilot-notice">{t('common.pilotNotice')}</div><div className="document-language no-print"><label htmlFor={id}>{t('documents.recipientLanguage')}</label><select id={id} value={state.locale} disabled={state.busy} onChange={e=>{const value=e.target.value;if(isLocale(value)){setError(false);void state.change(value).catch(()=>setError(true))}}}>{locales.map(locale=><option key={locale} value={locale}>{languageNames[locale]}</option>)}</select>{error&&<span role="alert">{t('errors.requestFailed')}</span>}</div></>;
}
