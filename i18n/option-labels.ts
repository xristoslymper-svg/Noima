'use client';
import {useTranslations} from 'next-intl';
import {optionKeys} from './option-keys';
export function useOptionLabel(){
 const t=useTranslations();
 return (canonicalLabel:string)=>{const key=optionKeys[canonicalLabel as keyof typeof optionKeys];return key?t(key):canonicalLabel};
}
