import {notFound} from 'next/navigation';
import TeleconsultationsPreview from '@/components/teleconsultations/TeleconsultationsPreview';
import {previewEnabled,persistentVisitEnabled} from '@/lib/teleconsultations/policy';
import TeleconsultationsConnected from '@/components/teleconsultations/TeleconsultationsConnected';
export const dynamic='force-dynamic';
export default function Page(){
 if(persistentVisitEnabled(process.env))return <TeleconsultationsConnected/>;
 if(!previewEnabled(process.env))notFound();
 return <TeleconsultationsPreview/>;
}
