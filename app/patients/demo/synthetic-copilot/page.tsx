import {notFound} from 'next/navigation';
import SyntheticPatientCard from '@/components/patients/SyntheticPatientCard';
import {syntheticPreviewEnabled,syntheticPatient} from '@/lib/copilot/preview';
export const dynamic='force-dynamic';
export default function SyntheticPatientPage(){
 if(!syntheticPreviewEnabled())notFound();
 return <SyntheticPatientCard bundle={syntheticPatient()}/>;
}
