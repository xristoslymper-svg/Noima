export const dynamic='force-dynamic';

export async function GET(){
 return Response.json({error:'Η legacy κλινική ροή έχει αποσυρθεί. Χρησιμοποιήστε τον φάκελο ασθενούς και τη συνδεδεμένη συνεδρία.'},{status:410});
}

export async function POST(){
 return Response.json({error:'Η legacy κλινική ροή έχει αποσυρθεί. Οι εγκρίσεις γίνονται μόνο μέσα στη συνδεδεμένη συνεδρία.'},{status:410});
}
