import {copilotPatients} from './synthetic-fixtures.mjs';
export const SYNTHETIC_CHART_PATH='/patients/demo/synthetic-copilot';
export function syntheticPreviewEnabled(){
 return process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='codex/clinical-copilot-agent'&&process.env.COPILOT_INTERACTIVE_SYNTHETIC==='true'&&process.env.EXTERNAL_AI_ENABLED!=='false';
}
export function syntheticPatient(){
 const bundle=copilotPatients()[0];
 bundle.patient.first_name='Μαρία';bundle.patient.last_name='Δοκιμαστική';
 return bundle;
}
