import Link from 'next/link';
import {PasswordResetRequest} from '@/components/PasswordForms';

export default function ForgotPassword(){
 return <main className="pilot-page"><section className="pilot-card"><Link href="/login">← Επιστροφή στη σύνδεση</Link><div className="brand-mark">Ψ</div><span className="kicker">NOIMA · ΑΣΦΑΛΕΙΑ ΛΟΓΑΡΙΑΣΜΟΥ</span><h1>Επαναφορά κωδικού</h1><p>Συμπληρώστε το email του λογαριασμού σας. Αν υπάρχει λογαριασμός, θα σταλεί σύνδεσμος για νέο κωδικό.</p><PasswordResetRequest/></section></main>;
}
