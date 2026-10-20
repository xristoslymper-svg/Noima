'use client';
import {useTranslations} from 'next-intl';
import {translateUiLabel} from './static-text';
export function useUiText(){const t=useTranslations();return (value:string)=>translateUiLabel(value,key=>t(key as never))}
