
import {useTranslations} from 'next-intl';
import Link from 'next/link';
import {PasswordResetRequest} from '@/components/PasswordForms';
import {authEmailEnabled} from '@/lib/pilot/auth-email';
export const dynamic='force-dynamic';

export default function ForgotPassword(){
 const t=useTranslations();

 return <main className="pilot-page"><section className="pilot-card"><Link href="/login">{t('navigation.backToSignIn')}</Link><div className="brand-mark">Ψ</div><span className="kicker">{t('settings.accountSecurityBrand')}</span><h1>{t('settings.resetPassword')}</h1>{authEmailEnabled?<><p>{t('settings.resetPasswordHelp')}</p><PasswordResetRequest/></>:<p>{t('settings.passwordResetUnavailable')}</p>}<p><small>{t('settings.googleResetHelp')}</small></p></section></main>;
}
