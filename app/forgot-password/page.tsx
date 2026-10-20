import {useTranslations} from 'next-intl';
import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import {PasswordResetRequest} from '@/components/PasswordForms';
import {authEmailEnabled} from '@/lib/pilot/auth-email';
export const dynamic='force-dynamic';

export default function ForgotPassword(){
 const t=useTranslations();

 return <AuthShell><h1>{t('settings.resetPassword')}</h1>{authEmailEnabled?<><p>{t('current.m000')}</p><PasswordResetRequest/></>:<p>{t('settings.passwordResetUnavailable')}</p>}<Link className="auth-back" href="/login">{t('navigation.backToSignIn')}</Link><p><small>{t('current.m001')}</small></p></AuthShell>;
}
