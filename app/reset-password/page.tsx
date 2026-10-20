import {useTranslations} from 'next-intl';
import AuthShell from '@/components/AuthShell';
import {PasswordChangeForm} from '@/components/PasswordForms';

export default function ResetPassword(){
 const t=useTranslations();

 return <AuthShell><h1>{t('settings.newPassword')}</h1><p>{t('settings.setPasswordHelp')}</p><PasswordChangeForm recovery/></AuthShell>;
}
