import React from 'react';
import {createRoot} from 'react-dom/client';
import '../app/globals.css';
import '../app/clinical-refinement.css';
import '../app/visit-workspace.css';
import '../app/mobile.css';
import '../app/initial-assessment.css';
import '../app/clinical-editor.css';
import '../app/noima-ui.css';
import PatientWorkspace from '../components/patients/PatientWorkspace';

createRoot(document.getElementById('root')!).render(<>
  <div className="fictional-pilot-notice">LOCAL QA · μόνο υποθετικοί ασθενείς · προσομοιωμένο API</div>
  <PatientWorkspace patientRef="warm-patient"/>
</>);
