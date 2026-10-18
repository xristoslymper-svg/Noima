import {notFound} from 'next/navigation';
import TeleconsultationsPreview from '@/components/teleconsultations/TeleconsultationsPreview';
import {previewEnabled} from '@/lib/teleconsultations/policy';
export const dynamic='force-dynamic';
export default function Page(){
 if(!previewEnabled(process.env))notFound();
 return <TeleconsultationsPreview/>;
}
