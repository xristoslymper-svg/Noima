import {pilotScope} from '../lib/pilot/request-scope.ts';
import {isLocale} from './config.ts';

// Request-scoped, never global: concurrent doctors cannot affect each other's output.
export function withOutputLanguage(instructions:string){
 const locale=pilotScope.getStore()?.outputLocale;
 const language=isLocale(locale)&&locale==='en'?'English':'Greek';
 const prompt=language==='English'?instructions.replace(/\bGreek\b/gi,'English').replace(/στα ελληνικά|ελληνικά/gi,'in English'):instructions;
 return prompt+'\nOUTPUT LANGUAGE FOR THIS REQUEST: '+language+'. This explicit selection replaces any default output-language instruction above. Write only newly requested prose in this language. Keep database keys, enum values, identifiers, medication names, names and quoted source text unchanged. Preserve all clinical meaning, negation, uncertainty and attribution. Never rewrite existing stored entries in place.';
}
