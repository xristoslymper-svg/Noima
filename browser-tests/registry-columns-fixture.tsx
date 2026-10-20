import React from 'react';
import {createRoot} from 'react-dom/client';
import '../app/globals.css';
import '../app/noima-ui.css';
import '../app/clinical-refinement.css';
import '../app/mobile.css';
import Patients from '../app/patients/page';
createRoot(document.getElementById('root')!).render(<Patients/>);
