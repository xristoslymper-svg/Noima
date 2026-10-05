import {pilotClient} from '@/lib/pilot/server';
import {NextResponse} from 'next/server';

export async function GET(request:Request){
 const url=new URL(request.url),code=url.searchParams.get('code');
 if(code){
  const client=await pilotClient();
  const {error}=await client.auth.exchangeCodeForSession(code);
  if(!error){
   const {data}=await client.auth.getClaims();
   const claims=data?.claims as {amr?:Array<{method?:string}>}|undefined;
   const recovery=claims?.amr?.some(entry=>entry.method==='recovery')===true;
   return NextResponse.redirect(new URL(recovery?'/reset-password':'/pilot',request.url));
  }
 }
 return NextResponse.redirect(new URL('/login?error=oauth',request.url));
}
