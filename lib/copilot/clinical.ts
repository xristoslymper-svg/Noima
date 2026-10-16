import {maskProviderPayload} from '../clinical/text-masking.ts';
import type {PatientBundle} from '../patients/demo-runtime';
import {buildSummaryContext,summaryContextHash,SUMMARY_POLICY_VERSION,type Evidence,type Finding} from '../clinical/summary-context.ts';
import {providerEvidence} from '../clinical/provider-evidence.ts';
import {modelJSON,modelText,COPILOT_CONTEXT_LIMIT,objectSchema,stringSchema,type Usage} from './provider.ts';
export type Memory={patient_id:string;medication_ids:string[];focus_medication_id:string|null;after:string|null;question:string;expires:number};
export type Intent={patient_name:string;use_current_patient:boolean;tool:'medications'|'last_visit'|'next_appointment'|'tasks'|'psychometrics'|'medication_start'|'clinical'|'calendar'|'questionnaires'|'clarify';medication_number:number;after_focus:boolean;question:string;clarification:string};
const tools=['medications','last_visit','next_appointment','tasks','psychometrics','medication_start','clinical','calendar','questionnaires','clarify'];
export async function understand(query:string,memory:Memory|null,usage:Usage){
 const intent=await modelJSON<Intent>(
 'Understand Greek clinical-workspace requests. Select exactly one approved tool. Never provide clinical facts. Extract only a patient name explicitly in the CURRENT message; use_current_patient=true only for an unambiguous follow-up with no newly named patient. New or ambiguous patient references require clarification, never silently retain an ol¶»§q«^