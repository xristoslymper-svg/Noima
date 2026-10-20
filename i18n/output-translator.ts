import english from './messages/en.json' with {type:'json'};
import {makeTranslator} from './translate.ts';
import {pilotScope} from '../lib/pilot/request-scope.ts';
// Server-side deterministic responses use the same next-intl dictionaries.
// Only newly requested responses use this locale; saved conversations are not rewritten.
const translators={el:makeTranslator(),en:makeTranslator('en',english)};
export function outputLocale(){return pilotScope.getStore()?.outputLocale==='en'?'en':'el'}
export function outputTranslator(){return translators[outputLocale()]}
