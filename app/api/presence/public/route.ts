import {presenceCall} from '@/lib/presence/hosted-server';
import {hostedEnabled,validateBooking} from '@/lib/presence/public-policy';
import {bookingEnabled,validSlot} from '@/lib/presence/booking';
import {publicBooking} from '@/lib/presence/booking-server';
export const dynamic='force-dynamic';
export async function GET(req:Request){if(!bookingEnabled(process.env))return new Response(null,{status:404});return publicBooking(new URL(req.url).searchParams.get('slug')||'')}
export async function POST(req:Request){
 if(!hostedEnabled(process.env))return new Response(null,{status:404});if(req.headers.get('origin')!==new URL(req.url).origin)return new Response(null,{status:403});
 const text=await req.text();if(text.length>4000)return new Response(null,{status:413});
 try{const b=JSON.parse(text),request=validateBooking(b.request);
 if(bookingEnabled(process.env)){if(!validSlot(b.request))return Response.json({error:'Επιλέξτε διαθέσιμη ώρα.'},{status:400});return publicBooking(b.slug,{...request,start:b.request.start,end:b.request.end,consent:true,website:''})}
 return presenceCall({action:'request',slug:b.slug,request:{...request,consent:true,website:''}});
 }catch{return Response.json({error:'Ελέγξτε τα στοιχεία και την αποδοχή επικοινωνίας.'},{status:400})}
}
