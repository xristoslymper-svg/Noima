import {presenceCall} from '@/lib/presence/hosted-server';
import {hostedEnabled,validateBooking} from '@/lib/presence/public-policy';
export const dynamic='force-dynamic';
export async function POST(req:Request){if(!hostedEnabled(process.env))return new Response(null,{status:404});if(req.headers.get('origin')!==new URL(req.url).origin)return new Response(null,{status:403});const text=await req.text();if(text.length>4000)return new Response(null,{status:413});try{const b=JSON.parse(text);return presenceCall({action:'request',slug:b.slug,request:{...validateBooking(b.request),consent:true,website:''}})}catch{return Response.json({error:'Ελέγξτε τα στοιχεία και την αποδοχή επικοινωνίας.'},{status:400})}}
