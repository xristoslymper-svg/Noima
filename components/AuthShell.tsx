import LanguageSelector from '@/components/LanguageSelector';
import type {ReactNode} from 'react';
import '@/app/auth-screens.css';

export default function AuthShell({children,languageSelection=false}:{children:ReactNode;languageSelection?:boolean}){
 return <main className="pilot-page auth-page"><section className="pilot-card auth-card"><div className="auth-brand"><span className="brand-mark" aria-hidden="true">Ψ</span><span>psi-space</span>{languageSelection&&<LanguageSelector compact/>}</div>{children}</section></main>;
}
