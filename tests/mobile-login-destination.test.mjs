import {intlTestModule} from './helpers/i18n.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as localeConfig from '../i18n/config.ts';

const source=ts.transpileModule(readFileSync('middleware.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
async function route(path,{mobile=false,user=true,identity=true,cookie,preference,environment='production'}={}){
 const jar=new Map();
 const response=(options)=>({requestHeaders:options?.request?.headers,headers:new Headers(),cookies:{set(name,value){jar.set(name,value)},getAll(){return [...jar].map(([name,value])=>({name,value}))}}});
 const mod={exports:{}};
 vm.runInNewContext(source,{module:mod,exports:mod.exports,URL,Headers,process:{env:{VERCEL_ENV:environment}},require:(id)=>(intlTestModule(id)??(id=>{
  if(id.includes('i18n/config'))return localeConfig;
  if(id==='@supabase/ssr')return {createServerClient:()=>({auth:{getUser:async()=>({data:{user:user?{id:'synthetic',user_metadata:{noima_locale:preference}}:null}})},rpc:async()=>({data:identity?{workspace_id:'synthetic-workspace'}:null})})};
  if(id==='next/server')return {NextResponse:{next:response,redirect:url=>({...response(),destination:String(url)})}};
  if(id.includes('mobile-v2'))return {mobileV2Enabled:mobile};
  return {supabaseUrl:'https://synthetic.supabase.co',supabaseKey:'synthetic-public'};
 })(id))});
 const url=new URL(path,'https://noima-mobile.vercel.app');
 return mod.exports.middleware({url:url.href,nextUrl:url,headers:new Headers(),cookies:{getAll:()=>[],get:name=>name===localeConfig.localeCookie&&cookie?{value:cookie}:undefined,set(){},toString:()=>''}});
}
test('mobile login redirects stay on the same origin and open calendar; desktop retains overview',async()=>{
 for(const path of ['/login','/pilot','/forgot-password']){
  assert.equal((await route(path,{mobile:true})).destination,'https://noima-mobile.vercel.app/calendar');
  assert.equal((await route(path)).destination,'https://noima-mobile.vercel.app/');
 }
});
test('mobile presentation flag preserves authentication and recovery routes',async()=>{
 assert.equal((await route('/calendar',{mobile:true,user:false})).destination,'https://noima-mobile.vercel.app/login');
 assert.equal((await route('/calendar',{mobile:true,identity:false})).destination,'https://noima-mobile.vercel.app/pilot');
 assert.equal((await route('/reset-password',{mobile:true})).destination,undefined);
 assert.equal((await route('/patients/demo/synthetic',{mobile:true})).destination,undefined);
});

test('login language cookie wins over older account language after sign-in in preview and production',async()=>{
 for(const environment of ['production','preview']){
  for(const path of ['/patients','/forgot-password','/login']){
   const response=await route(path,{cookie:'en',preference:'el',identity:false,environment});
   if(response.requestHeaders)assert.equal(response.requestHeaders.get('x-noima-locale'),'en');
  }
  assert.equal((await route('/patients',{cookie:'el',preference:'en',environment})).requestHeaders.get('x-noima-locale'),'el');
  assert.equal((await route('/patients',{preference:'en',environment})).requestHeaders.get('x-noima-locale'),'en');
 }
});
