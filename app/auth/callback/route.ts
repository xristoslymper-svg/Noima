import {pilotClient} from '@/lib/pilot/server';
import {NextResponse} from 'next/server';
export async function GET(request:Request){
 const url=new URL(request.url),code=url.searchParams.get('code');
 if(code){const client=await pilotClient();const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL('/pilot',request.url));}
 return NextResponse.redirect(new URL('/login?error=oauth',request.url));
}
