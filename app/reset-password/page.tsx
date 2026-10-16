
import {useTranslations} from 'next-intl';
import {PasswordChangeForm} from '@/components/PasswordForms';

export default function ResetPassword(){
 const t=useTranslations();

 return <main className="pilot-page"><section className="pilot-card"><div className="brand-mark">Ψ</div><span className="kicker">{t('settings.accountSecurityBrand')}</span><h1>{t('settings.newPassword')}</h1><p>{t('settings.setPasswordHelp')}</p><PasswordChangeForm recovery/></section></main>;
}
