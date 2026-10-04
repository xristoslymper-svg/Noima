import { withPilot } from '@/lib/pilot/route';
export const dynamic='force-dynamic';

async function handleGET(){
 return Response.json({error:'Η legacy κλινική ροή έχει αποσυρθεί. Χρησιμοποιήστε τον φάκελο ασθενούς και τη συνδεδεμένη συνεδρία.'},{status:410});
}

async function handlePOST(){
 return Response.json({error:'Η legacy κλινική ροή έχει αποσυρθεί. Οι εγκρίσεις γίνονται μόνο μέσα στη συνδεδεμένη συνεδρία.'},{status:410});
}

export const GET = withPilot(handleGET);
export const POST = withPilot(handlePOST);
