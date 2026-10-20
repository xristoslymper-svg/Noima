import {googleMapsLiveEnabled} from '@/lib/presence/google-maps';
export function POST(){
 // Fail before Auth/DB/provider access. Activation requires a separate reviewed change.
 return Response.json({code:'google_business_not_enabled',enabled:googleMapsLiveEnabled(),error:'Η πραγματική σύνδεση Google δεν έχει ενεργοποιηθεί.'},{status:503,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
