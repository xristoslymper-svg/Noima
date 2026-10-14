import {notFound} from 'next/navigation';
import PatientWorkspace from '@/components/patients/PatientWorkspace';
import {syntheticPreviewEnabled,syntheticPatient} from '@/lib/copilot/preview';
export const dynamic='force-dynamic';
export default function SyntheticPatientPage(){
 if(!syntheticPreviewEnabled())notFound();
 const bundle=syntheticPatient();
 return <PatientWorkspace patientRef={bundle.patient.id} previewBundle={bundle}/>;
}
