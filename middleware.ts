import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseUrl, supabaseKey } from './lib/pilot/config';
import {resolveLocale, localeCookie} from './i18n/config';
import {recipientLocale} from './i18n/recipient';
import {mobileV2Enabled} from './components/mobile/mobile-v2';

export async function middleware(request:NextRequest) {
  if(/^\/iatreio\/[a-z0-9][a-z0-9-]{2,59}\/?$/.test(request.nextUrl.pathname)&&(process.env.VERCEL_ENV==='production'||(process.env.VERCEL_ENV==='preview'&&['codex/public-practice','codex/public-booking-calendar'].includes(process.env.VERCEL_GIT_COMMIT_REF||'')))){const result=NextResponse.next();result.headers.set('Cache-Control','no-store');result.headers.set('X-Robots-Tag','noindex, nofollow');result.headers.set('Referrer-Policy','no-referrer');return result;}
  // Public form only: GET never verifies or consumes an email recovery token.
  if(request.nextUrl.pathname==='/reset-password'){
    const recovery=NextResponse.next({request});
    recovery.headers.set('Cache-Control','private, no-store');
    recovery.headers.set('Referrer-Policy','no-referrer');
    recovery.headers.set('X-Robots-Tag','noindex, nofollow');
    return recovery;
  }
  if(request.nextUrl.pathname==='/copilot-evaluation.html'&&process.env.VERCEL_ENV==='preview'){
    const report=NextResponse.next();
    report.headers.set('X-Robots-Tag','noindex, nofollow');
    report.headers.set('Cache-Control','no-store');
    report.headers.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    return report;
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('x-noima-locale');
  let response=NextResponse.next({request: {headers: requestHeaders}});
  const client=createServerClient(supabaseUrl,supabaseKey,{cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll:values=>{values.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request: {headers: new Headers([...requestHeaders, ['cookie', request.cookies.toString()]])}});values.forEach(({name,value,options})=>response.cookies.set(name,value,options));},
  }});
  const {data:{user}}=await client.auth.getUser();
  const path=request.nextUrl.pathname;
  const patientPage=['/assessment','/intake','/tablet'].includes(path);
  const locale = patientPage?recipientLocale(request.nextUrl.searchParams.get('lang')):resolveLocale(user?.user_metadata?.noima_locale, request.cookies.get(localeCookie)?.value);
  requestHeaders.set('x-noima-locale', locale);
  requestHeaders.set('cookie', request.cookies.toString());
  const refreshed = NextResponse.next({request: {headers: requestHeaders}});
  response.cookies.getAll().forEach(cookie => refreshed.cookies.set(cookie));
  response = refreshed;
  const publicPath=path==='/login'||path==='/forgot-password'||patientPage;
  let destination:string|null=null;
  if(!user&&!publicPath) destination='/login';
  if(user&&!patientPage){
    const {data:identity}=await client.rpc('pilot_identity');
    if(identity) {
      response.cookies.set('noima-workspace-id',identity.workspace_id,{sameSite:'lax',secure:request.nextUrl.protocol==='https:',path:'/'});
      if(path==='/login'||path==='/pilot'||path==='/forgot-password') destination=mobileV2Enabled?'/calendar':'/';
    } else if(path!=='/pilot'&&path!=='/login'&&path!=='/account'&&path!=='/reset-password') destination='/pilot';
  }
  if(destination){const redirect=NextResponse.redirect(new URL(destination,request.url));response.cookies.getAll().forEach(c=>redirect.cookies.set(c));response=redirect;}
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config={matcher:['/((?!api|auth/callback|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm|onnx)$).*)']};
