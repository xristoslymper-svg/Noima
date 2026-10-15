import {createTranslator} from 'next-intl';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as errorTools from '../../i18n/errors.ts';
import * as outputTranslator from '../../i18n/output-translator.ts';
import * as outputLanguage from '../../i18n/output-language.ts';
import * as config from '../../i18n/config.ts';
import * as recipient from '../../i18n/recipient.ts';
import * as clinicTime from '../../lib/clinic-time.ts';

const dictionaries=Object.fromEntries(['el','en'].map(locale=>[locale,JSON.parse(readFileSync(new URL('../../i18n/messages/'+locale+'.json',import.meta.url),'utf8'))]));
// The isolated hook harnesses do not mount a React provider. Use the real ICU
// translator and production dictionaries; fail immediately on missing messages.
export function intlTestModule(name,locale='el'){
 if(name==='next-intl')return {
  createTranslator,
  useLocale:()=>locale,
  useTranslations:namespace=>createTranslator({locale,messages:dictionaries[locale],namespace,onError:error=>{throw error}})
 };
 if(name==='@/i18n/errors')return errorTools;
 if(name==='@/i18n/config'||name.endsWith('/i18n/config.ts'))return config;
 if(name==='@/i18n/recipient'||name.endsWith('/i18n/recipient'))return recipient;
 if(name==='@/i18n/messages')return {loadMessages:async locale=>dictionaries[locale]};
 if(name==='@/i18n/output-language')return outputLanguage;
 if(name==='@/i18n/output-translator'||name.endsWith('/i18n/output-translator.ts'))return outputTranslator;
 if(name==='@/i18n/option-labels'||name==='@/i18n/system-message'||name==='./option-keys'||name==='./option-labels'||name==='@/i18n/evidence-label'){
  const module={exports:{}};
  const source=ts.transpileModule(readFileSync(new URL('../../i18n/'+name.split('/').at(-1)+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,require:id=>id==='@/lib/clinic-time'?clinicTime:intlTestModule(id,locale)});
  return module.exports;
 }
 return undefined;
}
