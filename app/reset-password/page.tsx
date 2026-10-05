import {PasswordChangeForm} from '@/components/PasswordForms';

export default function ResetPassword(){
 return <main className="pilot-page"><section className="pilot-card"><div className="brand-mark">Ψ</div><span className="kicker">NOIMA · ΑΣΦΑΛΕΙΑ ΛΟΓΑΡΙΑΣΜΟΥ</span><h1>Νέος κωδικός</h1><p>Ορίστε νέο κωδικό για τον λογαριασμό σας.</p><PasswordChangeForm recovery/></section></main>;
}
