import {cookies} from 'next/headers';import {NextResponse} from 'next/server';
import {pilotClient} from '@/lib/pilot/server';import {seal,unseal} from '@/lib/mail/crypto';
import {callback,mailboxEmail,tokens,type Provider} from '@/lib/mail/providers';
export async function GET(req:Request){const client=await pilotClient(),jar=await cookies(),stored=jar.get('noima-mail-oauth')?.value;jar.delete('noima-mail-oauth');const {data:{user}}=await client.auth.getUser();const url=new URL(req.url);
 try{if(!user||!stored||url.searchParams.has('error'))throw new Error('oauth');const state=unseal<{state:string;verifier:string;provider:Provider;user:string;created:number}>(stored,user.id);if(state.user!==user.id||Date.now()-state.created>600000||state.state!==url.searchParams.get('state')||!url.searchParams.get('code'))throw new Error('oauth');
 const grant=await tokens(state.provider,{grant_type:'authorization_code',code:url.searchParams.get('code')!,redirect_uri:callback(),code_verifier:state.verifier});if(!grant.refresh_token)throw new Error('oauth');const email=await mailboxEmail(state.provider,grant.access_token);const {error}=await client.rpc('pilot_mailbox_save',{p_provider:state.provider,p_email:email,p_tokens:seal(grant,user.id)});if(error)throw new Error('oauth');return NextResponse.redirect(new URL('/account?mail=connected',req.url));
 }catch{return NextResponse.redirect(new URL('/account?mail=error',req.url))}
}
