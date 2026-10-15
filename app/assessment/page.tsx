import DocumentLocaleProvider from '@/i18n/DocumentLocaleProvider';
import {loadMessages} from '@/i18n/messages';
import {recipientLocale} from '@/i18n/recipient';
import AssessmentForm from './AssessmentForm';
export default async function Page({searchParams}:{searchParams:Promise<{lang?:string}>}){
 const locale=recipientLocale((await searchParams).lang);
 return <DocumentLocaleProvider locale={locale} messages={await loadMessages(locale)}><AssessmentForm/></DocumentLocaleProvider>;
}
