export type ClinicalProposal = {
 id: string; session_id: string; section_key: string; transcript: string;
 proposal: {clinical_text: string; facts: {label: string; value: string}[];writing?:{kind:'dictation'|'ai';original:string}};
 status: 'proposal'|'approved'; approved_text: string|null; approved_at: string|null;
 model: string|null; created_at: string;
};
export type Addendum = {id:string;session_id:string;content:string;reason:string;kind:string;actor_id:string;created_at:string};
export type StructuredCorrection = {id:string;request_id:string;tester_id:string;actor_id:string;patient_id:string;session_id:string;reason:string;patch:Record<string,{before:unknown;after:unknown}>;created_at:string};
export type Assessment = {id:string;patient_id:string;appointment_id:string|null;session_id:string|null;intake_id?:string|null;instrument:'PHQ-9'|'GAD-7';instrument_version:string;status:'assigned'|'opened'|'completed'|'revoked';expires_at:string;opened_at:string|null;completed_at:string|null;answers:number[]|null;score:number|null;item9_review:boolean;item9_reviewed_at:string|null;reviewed_at:string|null;provenance?:string|null;created_at:string};
