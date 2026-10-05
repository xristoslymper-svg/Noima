import PatientWorkspace from '@/components/patients/PatientWorkspace';
export default async function DemoPatientPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PatientWorkspace key={id} patientRef={id}/>}
