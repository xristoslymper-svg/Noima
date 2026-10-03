import { redirect } from 'next/navigation';

export default function MariaDictationPage(){
  redirect('/patients/maria?tab=sessions');
}
