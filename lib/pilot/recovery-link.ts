// A recovery link is a bearer credential. Keep it in the URL fragment, not server logs.
export function isRecoveryTokenHash(value:unknown):value is string{
 return typeof value==='string'&&/^(?:pkce_)?[a-f0-9]{40,128}$/i.test(value);
}
export function recoveryTokenFromFragment(fragment:string):string|undefined{
 const params=new URLSearchParams(fragment.replace(/^#/,''));
 const values=params.getAll('token_hash');
 if(!values.length)return undefined;
 return values.length===1&&isRecoveryTokenHash(values[0])?values[0]:'';
}
