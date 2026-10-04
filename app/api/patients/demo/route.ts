import { withPilot } from '@/lib/pilot/route';
export const dynamic='force-dynamic';
async function handleGET(){return Response.json({error:'Η legacy patient API έχει αποσυρθεί. Χρησιμοποιήστε το tester-scoped /api/patients/demo/runtime.'},{status:410})}
async function handlePOST(){return Response.json({error:'Η legacy patient API έχει αποσυρθεί. Η δημιουργία ασθενούς γίνεται μόνο από το canonical runtime.'},{status:410})}

export const GET = withPilot(handleGET);
export const POST = withPilot(handlePOST);
