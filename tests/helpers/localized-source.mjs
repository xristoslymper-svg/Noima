import {readFileSync} from 'node:fs';
import ts from 'typescript';
const messages=JSON.parse(readFileSync(new URL('../../i18n/messages/el.json',import.meta.url),'utf8'));

// Existing source-layout regressions assert the Greek presentation. Resolve only
// constant translation calls from the real dictionary; leave all control flow,
// handlers, values and markup structure intact. Runtime tests use the ICU helper.
export function readLocalizedSource(path,encoding){
 let source=readFileSync(path,encoding);
 if(typeof source!=='string'||!String(path).endsWith('.tsx'))return source;
 const ast=ts.createSourceFile(String(path),source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
 function visit(node){
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='t'&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0])){
   const key=node.arguments[0].text,value=key.split('.').reduce((v,k)=>v?.[k],messages);
   if(typeof value!=='string')throw new Error('Missing Greek translation: '+key);
   let target=node,text="'"+value.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n')+"'";
   if(ts.isJsxExpression(node.parent)&&node.parent.expression===node){
    target=node.parent;
    text=ts.isJsxAttribute(target.parent)?JSON.stringify(value):value;
   }
   edits.push({start:target.getStart(ast),end:target.end,text});return;
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);
 for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
 return source;
}
