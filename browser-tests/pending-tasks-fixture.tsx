import React from 'react';
import {createRoot} from 'react-dom/client';
import PendingTasksPreview from '../components/overview/PendingTasksPreview';
import '../app/globals.css';
import '../app/noima-ui.css';
import '../app/overview-search.css';
createRoot(document.getElementById('root')!).render(<PendingTasksPreview/>);
