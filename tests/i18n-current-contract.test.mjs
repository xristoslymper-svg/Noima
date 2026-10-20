import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/pre-localization-ui.json',import.meta.url),'utf8'));
const styles=JSON.parse(readFileSync(new URL('./fixtures/pre-localization-styles.json',import.meta.url),'utf8'));
const messages=JSON.parse(readFileSync(new URL('../i18n/messages/el.json',import.meta.url),'utf8'));
const value=key=>key.split('.').reduce((a,k)=>a?.[k],messages);
const printer=ts.createPrinter({removeComments:true});
function canonical(expression,source){
 const result=ts.transform(expression,[context=>{
  const visit=node=>{
   if(ts.isCallExpression(node)){
    const name=node.expression.getText(source);
    if(['ui','displayLabel','systemMessage'].includes(name)&&node.arguments.length===1)return ts.visitNode(node.arguments[0],visit);
    if(name==='t'&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0])){
     const label=value(node.arguments[0].text);if(typeof label==='string')return ts.factory.createStringLiteral(label);
    }
    if(['setError','setNotice','setStatus','setMessage','setRecordNotice','window.confirm','confirm'].includes(name)&&node.arguments.length===1)return ts.factory.updateCallExpression(node,node.expression,node.typeArguments,[ts.factory.createStringLiteral('__PRESENTATION__')]);
    if(['formatClinicDateTime','formatClinicAppointment','recordDate'].includes(name)&&node.arguments.length>1)return ts.factory.updateCallExpression(node,node.expression,node.typeArguments,[ts.visitNode(node.arguments[0],visit)]);
   }
   return ts.visitEachChild(node,visit,context);
  };return root=>ts.visitNode(root,visit);
 }]);
 const text=printer.printNode(ts.EmitHint.Unspecified,result.transformed[0],source);result.dispose();return text;
}
function contract(text,path){
 const ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const attributes=[];
 function visit(n){
  if(ts.isJsxAttribute(n)){
   const key=n.name.getText(ast);
   if(['className','key','required','type','name','autoComplete','minLength','maxLength','min','max','onChange','onBlur','onClick','onSubmit','onConfirm','onSaved','onDirtyChange','registerFlusher'].includes(key)){
    const initializer=n.initializer;
    const expression=initializer&&ts.isJsxExpression(initializer)?initializer.expression:initializer;
    if(expression){const code=canonical(expression,ast);if(!/setDocumentLocale/.test(code))attributes.push(key+':'+code);}
    else attributes.push(key+':true');
   }
  }
  ts.forEachChild(n,visit);
 }visit(ast);
 return attributes.sort();
}
for(const [path,source]of Object.entries(baseline))test('localization preserves existing clinical controls and handlers: '+path,()=>{
 const before=contract(source,path),after=contract(readFileSync(path,'utf8'),path);
 const counts=new Map();for(const item of after)counts.set(item,(counts.get(item)||0)+1);
 const missing=[];for(const item of before){const n=counts.get(item)||0;if(n)counts.set(item,n-1);else missing.push(item)}
 assert.deepEqual(missing,[],'Existing field, control, handler or layout changed');
});
test('every existing stylesheet remains byte-identical to production b8649aa',()=>{
 for(const [path,sha]of Object.entries(styles)){
  const content=readFileSync(path);const actual=createHash('sha1').update('blob '+content.length+'\0').update(content).digest('hex');assert.equal(actual,sha,path);
 }
});
