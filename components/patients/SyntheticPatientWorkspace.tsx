'use client';
import type {PatientBundle} from '@/lib/patients/demo-runtime';
import PatientWorkspace from './PatientWorkspace';
import {SyntheticChartContext} from './SyntheticChartContext';
export default function SyntheticPatientWorkspace({bundle}:{bundle:PatientBundle}){
 return <SyntheticChartContext.Provider value={true}><PatientWorkspace patientRef={bundle.patient.id} previewBundle={bundle}/></SyntheticChartContext.Provider>;
}
