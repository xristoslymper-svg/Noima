export const dynamic='force-dynamic';
export async function GET(){return Response.json({error:'Η legacy patient API έχει αποσυρθεί. Χρησιμοποιήστε το tester-scoped /api/patients/demo/runtime.'},{status:410})}
export async function POST(){return Response.json({error:'Η legacy patient API έχει αποσυρθεί. Η δημιουργία ασθενούς γίνεται μόνο από το canonical runtime.'},{status:410})}
