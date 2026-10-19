import {pilotClient} from '@/lib/pilot/server';
import {presenceCall} from '@/lib/presence/hosted-server';
import {hostedEnabled} from '@/lib/presence/public-policy';
export const dynamic='force-dynamic';
async function auth(){const c=await pilotClient();const {data:{user}}=await c.auth.getUser();if(!user)return null;const {data:{session}}=await c.auth.getSession();return session?.access_token||null}
export async function GET(){if(!hostedEnabled(process.env))return new Response(null,{status:404});const token=await auth();return token?presenceCall({action:'owner'},token):Response.json({error:'Συνδεθείτε.'},{status:401})}
export async function POST(req:Request){if(!hostedEnabled(process.env))return new Response(null,{status:404});if(req.headers.get('origin')!==new URL(req.url).origin)return new Response(null,{status:403});const token=await auth();if(!token)return new Response(null,{status:401});const text=await req.text();if(text.length>250000)return new Response(null,{status:413});try{const b=JSON.parse(text);return presenceCall({action:'publish',workspace:b.workspace,revision:b.revision},token)}catch{return Response.json({error:'Μη έγκυρο περιεχόμενο.'},{status:400})}}
