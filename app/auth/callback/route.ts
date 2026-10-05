import {pilotClient} from '@/lib/pilot/server';
import {NextResponse} from 'next/server';

function redirect(request:Request,path:string){
 const response=NextResponse.redirect(new URL(path,request.url));
 response.headers.set('Cache-Control','private, no-store');
 return response;
}

export async function GET(request:Request){
 const url=new URL(request.url),code=url.searchParams.get('code');
 if(code){
  const client=await pilotClient();
  const {error}=await client.auth.exchangeCodeForSession(code);
  if(!error){
   const {data}=await client.auth.getClaims();
   const claims=data?.claims as {amr?:Array<{method?:string}>}|undefined;
   const recovery=claims?.amr?.some(entry=>entry.method==='recovery')===true;
   return redirect(request,recovery?'/reset-password':'/pilot');
  }
 }
 return redirect(request,'/login?error=oauth');
}
