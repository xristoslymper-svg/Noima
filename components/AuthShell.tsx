import type {ReactNode} from 'react';
import '@/app/auth-screens.css';

export default function AuthShell({children}:{children:ReactNode}){
 return <main className="pilot-page auth-page"><section className="pilot-card auth-card"><div className="auth-brand"><span className="brand-mark" aria-hidden="true">Ψ</span><span>NOIMA</span></div>{children}</section></main>;
}
