import Link from 'next/link';
import {PasswordResetRequest} from '@/components/PasswordForms';
import {authEmailEnabled} from '@/lib/pilot/auth-email';
export const dynamic='force-dynamic';

export default function ForgotPassword(){
 return <main className="pilot-page"><section className="pilot-card"><Link href="/login">← Επιστροφή στη σύνδεση</Link><div className="brand-mark">Ψ</div><span className="kicker">NOIMA · ΑΣΦΑΛΕΙΑ ΛΟΓΑΡΙΑΣΜΟΥ</span><h1>Επαναφορά κωδικού</h1>{authEmailEnabled?<><p>Συμπληρώστε το email που χρησιμοποιείτε με κωδικό στο NOIMA. Αν υπάρχει λογαριασμός, θα σταλεί σύνδεσμος για νέο κωδικό.</p><PasswordResetRequest/></>:<p>Η αποστολή συνδέσμων επαναφοράς δεν είναι διαθέσιμη ακόμη.</p>}<p><small>Αν συνδέεστε με Google, επιστρέψτε στη σύνδεση και επιλέξτε «Συνέχεια με Google».</small></p></section></main>;
}
