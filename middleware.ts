import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseUrl, supabaseKey } from './lib/pilot/config';

export async function middleware(request:NextRequest) {
  let response=NextResponse.next({request});
  const client=createServerClient(supabaseUrl,supabaseKey,{cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll:values=>{values.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});values.forEach(({name,value,options})=>response.cookies.set(name,value,options));},
  }});
  const {data:{user}}=await client.auth.getUser();
  const path=request.nextUrl.pathname;
  let destination:string|null=null;
  if(!user && path!=='/login') destination='/login';
  if(user){
    const {data:identity}=await client.rpc('pilot_identity');
    if(identity) {
      response.cookies.set('noima-workspace-id',identity.workspace_id,{sameSite:'lax',secure:request.nextUrl.protocol==='https:',path:'/'});
      if(path==='/login'||path==='/pilot') destination='/';
    } else if(path!=='/pilot'&&path!=='/login'&&path!=='/account') destination='/pilot';
  }
  if(destination){const redirect=NextResponse.redirect(new URL(destination,request.url));response.cookies.getAll().forEach(c=>redirect.cookies.set(c));response=redirect;}
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config={matcher:['/((?!api|auth/callback|assessment|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm|onnx)$).*)']};
