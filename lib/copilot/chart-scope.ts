/** Exact, built-in chart routes only; no caller-supplied records or arbitrary IDs. */
export type SyntheticChartKey='copilot'|'treatment';
export function syntheticChartAt(path:string):{key:SyntheticChartKey;label:string}|null{
 if(path==='/patients/demo/treatment-preview')return {key:'treatment',label:'Ira Pira'};
 if(path==='/patients/demo/synthetic-copilot')return {key:'copilot',label:'Μαρία Δοκιμαστική'};
 return null;
}
