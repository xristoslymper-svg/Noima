import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import {PasswordResetRequest} from '@/components/PasswordForms';
import {authEmailEnabled} from '@/lib/pilot/auth-email';
export const dynamic='force-dynamic';

export default function ForgotPassword(){
 return <AuthShell><h1>Επαναφορά κωδικού</h1>{authEmailEnabled?<><p>Συμπληρώστε το email που χρησιμοποιείτε με κωδικό στο NOIMA. Θα σας στείλουμε οδηγίες επαναφοράς, εφόσον υπάρχει λογαριασμός.</p><PasswordResetRequest/></>:<p>Η αποστολή συνδέσμων επαναφοράς δεν είναι διαθέσιμη ακόμη.</p>}<Link className="auth-back" href="/login">← Επιστροφή στη σύνδεση</Link><p><small>Συνδέεστε με Google; Επιλέξτε «Συνέχεια με Google» στη σύνδεση.</small></p></AuthShell>;
}
