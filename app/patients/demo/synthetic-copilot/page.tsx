import {notFound} from 'next/navigation';
import SyntheticPatientWorkspace from '@/components/patients/SyntheticPatientWorkspace';
import {syntheticPreviewEnabled,syntheticPatient} from '@/lib/copilot/preview';
export const dynamic='force-dynamic';
export default function SyntheticPatientPage(){
 if(!syntheticPreviewEnabled())notFound();
 const bundle=syntheticPatient();
 return <SyntheticPatientWorkspace bundle={bundle}/>;
}
