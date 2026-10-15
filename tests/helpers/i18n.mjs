import {createTranslator} from 'next-intl';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const dictionaries=Object.fromEntries(['el','en'].map(locale=>[locale,JSON.parse(readFileSync(new URL('../../i18n/messages/'+locale+'.json',import.meta.url),'utf8'))]));
// The isolated hook harnesses do not mount a React provider. Use the real ICU
// translator and production dictionaries; fail immediately on missing messages.
export function intlTestModule(name,locale='el'){
 if(name==='next-intl')return {
  useLocale:()=>locale,
  useTranslations:namespace=>createTranslator({locale,messages:dictionaries[locale],namespace,onError:error=>{throw error}})
 };
 if(name==='@/i18n/option-labels'){
  const module={exports:{}};
  const source=ts.transpileModule(readFileSync(new URL('../../i18n/option-labels.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,require:id=>intlTestModule(id,locale)});
  return module.exports;
 }
 return undefined;
}
