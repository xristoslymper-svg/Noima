import AuthShell from '@/components/AuthShell';
import {PasswordChangeForm} from '@/components/PasswordForms';

export default function ResetPassword(){
 return <AuthShell><h1>Νέος κωδικός</h1><p>Ορίστε νέο κωδικό για τον λογαριασμό σας.</p><PasswordChangeForm recovery/></AuthShell>;
}
