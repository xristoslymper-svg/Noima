import React from 'react';
import fixture from './fixtures/warm-patient.json';
import {createRoot} from 'react-dom/client';
import '../app/globals.css';
import '../app/clinical-refinement.css';
import '../app/visit-workspace.css';
import '../app/mobile.css';
import '../app/initial-assessment.css';
import '../app/clinical-editor.css';
import '../app/noima-ui.css';
import ReceivedHistoryPreview from '../components/patients/ReceivedHistoryPreview';
import CalendarPage from '../app/calendar/page';
import Patients from '../app/patients/page';
import SyntheticPatientWorkspace from '../components/patients/SyntheticPatientWorkspace';
import type {PatientBundle} from '../lib/patients/demo-runtime';
import RecordAssistant from '../components/overview/RecordAssistant';
import PatientWorkspace from '../components/patients/PatientWorkspace';

createRoot(document.getElementById('root')!).render(<>
  <div className="fictional-pilot-notice">LOCAL QA · μόνο υποθετικοί ασθενείς · προσομοιωμένο API</div>
  {(location.pathname==='/timeline-preview'||location.pathname==='/patients/demo/treatment-preview')?<><SyntheticPatientWorkspace bundle={fixture as unknown as PatientBundle}/>{location.pathname==='/patients/demo/treatment-preview'&&<RecordAssistant/>}</>:location.pathname==='/calendar'?<CalendarPage/>:location.pathname==='/received-history-preview'?<ReceivedHistoryPreview/>:location.pathname==='/patients'?<Patients/>:<PatientWorkspace patientRef={fixture.patient.id}/>}
</>);
