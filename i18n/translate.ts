import {createTranslator} from 'next-intl';
import greek from './messages/el.json' with {type:'json'};
import type {Messages} from './messages';
import type {Locale} from './config';
export function makeTranslator(locale:Locale='el',messages:Messages=greek){return createTranslator({locale,messages})}
