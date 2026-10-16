import DocumentLocaleProvider from '@/i18n/DocumentLocaleProvider';
import {loadMessages} from '@/i18n/messages';
import {recipientLocale} from '@/i18n/recipient';
import BlankPrint from './BlankPrint';
export default async function Page({searchParams}:{searchParams:Promise<{tool?:string;lang?:string}>}){
 const q=await searchParams;
 const locale=recipientLocale(q.lang);
 const tool=['history','PHQ-9','GAD-7'].includes(q.tool||'')?q.tool!:'history';
 return <DocumentLocaleProvider locale={locale} messages={await loadMessages(locale)}><BlankPrint tool={tool}/></DocumentLocaleProvider>;
}
