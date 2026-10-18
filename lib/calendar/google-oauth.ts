import {createHash,randomBytes} from 'node:crypto';
export const calendarScopes=['https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
export type CalendarConfig={clientId:string;clientSecret:string;redirectUri:string};
export function calendarConfig():CalendarConfig|null{
 // Dedicated variables: email-send and NOIMA login grants remain untouched.
 const clientId=process.env.GOOGLE_CALENDAR_CLIENT_ID,clientSecret=process.env.GOOGLE_CALENDAR_CLIENT_SECRET,redirectUri=process.env.GOOGLE_CALENDAR_REDIRECT_URI;
 if(!clientId||!clientSecret||!redirectUri)return null;
 const url=new URL(redirectUri);if(url.protocol!=='https:'||url.pathname!=='/api/calendar/google/callback')throw new Error('invalid_calendar_redirect');
 return {clientId,clientSecret,redirectUri};
}
export function calendarAuthorization(config:CalendarConfig){
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:calendarScopes.join(' '),access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
 return {url:url.toString(),state,verifier};
}
export async function calendarGrant(config:CalendarConfig,grant:Record<string,string>,request:typeof fetch=fetch){
 const response=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,...grant}),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('calendar_authorization_required');
 const data=await response.json() as {access_token:string;refresh_token?:string;expires_in:number;scope?:string};
 if(!data.access_token)throw new Error('calendar_authorization_required');
 return data;
}
