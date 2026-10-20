import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
export const businessScope='https://www.googleapis.com/auth/business.manage';
export const callbackPath='/api/presence/google/callback';
export type OAuthTransaction={state:string;verifier:string;userId:string;workspaceId:string;redirectUri:string;createdAt:number};
export function validCallback(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname===callbackPath}catch{return false}}
export function beginOAuth(input:{userId:string;workspaceId:string;redirectUri:string;clientId:string},now=Date.now()){
 if(!input.userId||!input.workspaceId||!input.clientId||!validCallback(input.redirectUri))throw new Error('invalid_oauth_configuration');
 const transaction:OAuthTransaction={state:randomBytes(32).toString('base64url'),verifier:randomBytes(32).toString('base64url'),userId:input.userId,workspaceId:input.workspaceId,redirectUri:input.redirectUri,createdAt:now};
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:input.clientId,redirect_uri:input.redirectUri,response_type:'code',scope:businessScope,access_type:'offline',prompt:'consent',state:transaction.state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(transaction.verifier).digest('base64url')}).toString();
 return {transaction,url:url.toString()};
}
// The adapter must load the transaction from trusted server storage and atomically
// consume it (including denial). No user/tenant identity is accepted from query params.
export async function completeOAuth(transaction:OAuthTransaction|null,callback:string,identity:{userId:string;workspaceId:string},consume:(state:string)=>Promise<boolean>,now=Date.now()){
 if(!transaction||transaction.userId!==identity.userId||transaction.workspaceId!==identity.workspaceId)throw new Error('oauth_account_mismatch');
 if(!validCallback(transaction.redirectUri))throw new Error('invalid_oauth_configuration');
 const url=new URL(callback),expected=new URL(transaction.redirectUri);
 if(url.origin!==expected.origin||url.pathname!==expected.pathname||url.hash)throw new Error('oauth_callback_mismatch');
 if(now<transaction.createdAt||now-transaction.createdAt>=600000)throw new Error('oauth_expired');
 const state=url.searchParams.getAll('state'),code=url.searchParams.getAll('code'),error=url.searchParams.getAll('error');
 if(state.length!==1||Buffer.byteLength(state[0])!==Buffer.byteLength(transaction.state)||!timingSafeEqual(Buffer.from(state[0]),Buffer.from(transaction.state)))throw new Error('oauth_state_mismatch');
 if(code.length>1||error.length>1||(code.length&&error.length))throw new Error('oauth_invalid_response');
 if(!await consume(transaction.state))throw new Error('oauth_replayed');
 if(error.length)throw new Error(error[0]==='access_denied'?'oauth_denied':'oauth_provider_error');
 if(code.length!==1||!code[0]||code[0].length>4096)throw new Error('oauth_missing_code');
 return {code:code[0],verifier:transaction.verifier,redirectUri:transaction.redirectUri};
}
