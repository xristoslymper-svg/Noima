'use client';
import {useTranslations} from 'next-intl';
import {translateUiLabel} from './static-text';
// Presentation only: values written to records, form inputs and identifiers are never changed.
export function useUiText(){const t=useTranslations();return <T,>(value:T):T=>typeof value==='string'?translateUiLabel(value,key=>t(key as never)) as T:value}
