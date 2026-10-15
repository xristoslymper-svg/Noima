import {isLocale,type Locale} from './config';
export function recipientLocale(value:unknown):Locale{return isLocale(value)?value:'el'}
export function recipientLink(link:string,locale:Locale){const url=new URL(link);url.searchParams.set('lang',locale);return url.href}
