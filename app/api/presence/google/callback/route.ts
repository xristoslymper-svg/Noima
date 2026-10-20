export function GET(){
 // No token exchange, redirect or callback parameter reflection while disabled.
 return Response.json({code:'google_business_not_enabled',error:'Η πραγματική σύνδεση Google δεν έχει ενεργοποιηθεί. Επιστρέψτε στην Ψηφιακή παρουσία.'},{status:503,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
