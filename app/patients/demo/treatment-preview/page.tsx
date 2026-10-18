import {notFound} from 'next/navigation';
import SyntheticPatientWorkspace from '@/components/patients/SyntheticPatientWorkspace';
import fixture from '@/lib/clinical/treatment-preview.json';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
export const dynamic='force-dynamic';
export default function TreatmentPreview(){
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='codex/treatment-plan-visit-links')notFound();
 return <SyntheticPatientWorkspace bundle={fixture as unknown as PatientBundle}/>;
}
