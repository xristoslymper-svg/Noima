import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import ts from 'typescript';
import {parse} from '@formatjs/icu-messageformat-parser';
import {locales as configuredLocales,defaultLocale} from '../i18n/config.ts';

export function flatMessages(object,prefix=''){
 return Object.fromEntries(Object.entries(object).flatMap(([key,value])=>typeof value==='string'?[[prefix+key,value]]:Object.entries(flatMessages(value,prefix+key+'.'))));
}
export function auditDictionaries(root=process.cwd()){
 const locales=[...configuredLocales];
 const messages=Object.fromEntries(locales.map(locale=>[locale,flatMessages(JSON.parse(readFileSync(resolve(root,'i18n/messages/'+locale+'.json'),'utf8')))]));
 const allKeys=new Set(Object.keys(messages[defaultLocale])),used=new Set(),errors=[],calls=[];
 const parameters=value=>{const names=new Set();function walk(nodes){for(const node of nodes){if(node.type>=1&&node.type<=6)names.add(node.value);if(node.options)for(const option of Object.values(node.options))walk(option.value);if(node.children)walk(node.children)}}walk(parse(value));return [...names].sort().join(',')};
 for(const locale of locales){
  for(const key of allKeys)if(!(key in messages[locale]))errors.push(locale+': missing '+key);
  for(const [key,value]of Object.entries(messages[locale])){
   if(!allKeys.has(key))errors.push(locale+': extra '+key);
   try{if(parameters(value)!==parameters(messages[defaultLocale][key]||''))errors.push(locale+': mismatched ICU parameters '+key)}catch(error){errors.push(locale+': invalid ICU '+key+' — '+error.message)}
  }
 }
 function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]);}
 for(const file of ['app','components','lib','i18n'].flatMap(dir=>walk(resolve(root,dir))).filter(f=>/\.tsx?$/.test(f))){
  const source=readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),namespaces=new Set(['']);
  function collect(n){
   if(ts.isCallExpression(n)&&['useTranslations','getTranslations'].includes(n.expression.getText(ast))&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))namespaces.add(n.arguments[0].text+'.');
   ts.forEachChild(n,collect);
  }collect(ast);
  function visit(n){
   if(ts.isJsxText(n)&&/[Α-Ωα-ω]/u.test(n.text.replaceAll('Ψ',''))&&!(relative(root,file).replaceAll('\\\\','/')==='components/patients/ReceivedHistoryPreview.tsx'&&n.text.trim()==='Άννα Παραδείγματος')){
    errors.push(relative(root,file)+': untranslated Greek JSX text '+n.text.trim());
   }
   if(ts.isJsxAttribute(n)&&['title','placeholder','aria-label','alt'].includes(n.name.getText(ast))&&n.initializer&&ts.isStringLiteral(n.initializer)&&/[Α-Ωα-ω]/u.test(n.initializer.text)){
    errors.push(relative(root,file)+': untranslated Greek '+n.name.getText(ast));
   }
   if((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n))&&/[Α-Ωα-ω]/u.test(n.text)){
    let parent=n.parent,display=false,exempt=false;
    while(parent){
     if(ts.isCallExpression(parent)&&['ui','displayLabel','systemMessage','translateUiLabel','translateStaticMarkup'].includes(parent.expression.getText(ast))){exempt=true;break}
     if(ts.isBinaryExpression(parent)&&['===','!==','==','!='].includes(parent.operatorToken.getText(ast))){exempt=true;break}
     if(ts.isJsxAttribute(parent)){display=['title','label','help','description','placeholder','aria-label','alt','statusText','emptyText','emptyMessage','loadingText','savingText','confirmLabel','cancelLabel','buttonLabel'].includes(parent.name.getText(ast));break}
     if(ts.isJsxExpression(parent)&&!ts.isJsxAttribute(parent.parent)){display=true}
     if(ts.isJsxElement(parent)||ts.isJsxSelfClosingElement(parent))break;
     parent=parent.parent;
    }
    if(display&&!exempt)errors.push(relative(root,file)+': untranslated rendered literal '+n.text);
   }
   if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)){
    if(allKeys.has(n.text))used.add(n.text);
    if(ts.isCallExpression(n.parent)&&n.parent.arguments[0]===n&&n.parent.expression.getText(ast)==='t'){
     const matches=[...namespaces].map(ns=>ns+n.text).filter(key=>allKeys.has(key));
     if(!matches.length)errors.push(relative(root,file)+': unknown key '+n.text);
     for(const key of matches)used.add(key);
     calls.push({file:relative(root,file),key:n.text});
    }
   }
   if(ts.isPropertyAccessExpression(n))for(const key of allKeys)if(n.getText(ast).endsWith('.'+key))used.add(key);
   ts.forEachChild(n,visit);
  }visit(ast);
 }
 const unused=[...allKeys].filter(key=>!used.has(key)).sort();
 return {locales,keys:allKeys.size,calls:calls.length,errors,unused,messages};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
 const report=auditDictionaries();
 console.log(JSON.stringify({locales:report.locales,keys:report.keys,translationCalls:report.calls,errors:report.errors,unused:report.unused},null,2));
 if(process.argv.includes('--prune-unused')){
  if(report.errors.length)throw new Error('Fix dictionary errors before removing unused messages');
  for(const locale of report.locales){
   const path=resolve('i18n/messages/'+locale+'.json'),dictionary=JSON.parse(readFileSync(path,'utf8'));
   for(const key of report.unused){const parts=key.split('.');let object=dictionary;for(const part of parts.slice(0,-1))object=object[part];delete object[parts.at(-1)];}
   writeFileSync(path,JSON.stringify(dictionary,null,2)+'\n');
  }
 }else if(report.errors.length||report.unused.length)process.exitCode=1;
}
