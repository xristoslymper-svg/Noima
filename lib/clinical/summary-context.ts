import {riskFindings,riskFindingLabel} from './risk-findings.ts';
import {continuityContexts} from './continuity-context.ts';
import type {PatientBundle} from '../patients/demo-runtime';
import type {VisitDocument} from './visit-document';

export const SUMMARY_POLICY_VERSION=25;
export const categories=['Τρέχουσα εικόνα','Πορεία','Κίνδυνος','Αγωγή','Παρενέργειες','Ψυχομετρικά','Πλάνο','Χρειάζεται επιβεβαίωση','Σημαντικό ιστορικό'] as const;
export type Category=typeof categories[number];
export type Evidence={id:string;kind:string;label:string;date?:string;session_id?:string;section_key?:string;required_correction_ids?:string[];content:unknown;target:'sessions'|'medications'|'psychometrics'|'history'|'calendar';record_id:string};
export const summaryThemes=['general','medication','course','risk','psychometrics','plan','context'] as const;
export type SummaryTheme=typeof summaryThemes[number];
export type Finding={key:string;label:Category;text:string;source_ids:string[];attention:boolean;origin:'canonical'|'documented'|'synthesis';group_label?:string;theme?:SummaryTheme};
const names:Record<string,string>={interview:'Interview',mse:'MSE',assessment:'Assessment',plan:'Πλάνο',review:'Επανεκτίμηση',effects:'Παρενέργειες',functioning:'Λειτουργικότητα',adherence:'Λήψη αγωγής'};
const states:Record<string,string>={positive:'θετ���q�^