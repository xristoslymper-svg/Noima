import type {ContextRevision} from '../clinical/continuity-context';
import type {ContinuityDraft,VisitContinuity} from '../clinical/continuity';
import {pilotAuthorization} from '@/lib/pilot/request-scope';
import {isClinicalId} from '@/lib/clinical/identity';
import type {VisitDocument} from '@/lib/clinical/visit-document';
import type { ClinicalProposal, Addendum, Assessment, StructuredCorrection } from '@/lib/clinical/core-types';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mgpnaxaquzeoomxdzhic.supabase.co';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_g4MJzSlAYzIFAt9glM_WeQ_UcP-yheG';
const headers = () => ({ apikey: KEY || '', Authorization: `Bearer ${KEY || ''}`, 'Content-Type': 'application/json', ...pilotAuthorization() });

export type DemoPatient = { id:string; tester_id:string; first_name:string; last_name:string; reported_age:number|null; phone:string; landline:string; contact_phone:string; amka:string; address:string; email:string; chief_complaint:string; note:string; status:string; created_at:string; updated_at:string };
export type DemoSession = { closure_draft?:ContinuityDraft|null; closure_version?:number; continuity?:VisitContinuity|null; id:string; tester_id:string; patient_id:string; session_type:string; status:'draft'|'completed'; version:number; started_at:string; completed_at:string|null; updated_at:string };
export type DemoSection = { document?:VisitDocument|null; id:string; session_id:string; patie¶»§q«^