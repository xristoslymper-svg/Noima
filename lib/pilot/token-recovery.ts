import {createClient} from '@supabase/supabase-js';
import {supabaseUrl,supabaseKey} from './config';
import {isRecoveryTokenHash} from './recovery-link';

// Deliberately isolated from the browser's cookies, PKCE verifier and signed-in account.
export async function resetPasswordWithToken(tokenHash:unknown,password:unknown){
 if(!isRecoveryTokenHash(tokenHash)||typeof password!=='string'||password.length<12||password.length>128)return {ok:false,status:400};
 const client=createClient(supabaseUrl,supabaseKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 let verified=false,updated=false;
 try{
  const {data,error}=await client.auth.verifyOtp({token_hash:tokenHash,type:'recovery'});
  if(error)return {ok:false,status:error.status===429?429:403};
  if(!data.user||!data.session)return {ok:false,status:403};
  verified=true;
  const result=await client.auth.updateUser({password});
  if(result.error)return {ok:false,status:400};
  updated=true;
  return {ok:true,status:200};
 }catch{return {ok:false,status:503};}
 finally{
  // Revoke the recovery session; after a successful reset revoke old refresh sessions too.
  if(verified)await client.auth.signOut({scope:updated?'global':'local'}).catch(()=>{});
 }
}
