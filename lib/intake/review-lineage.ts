/** A completed public form that supplied patient identity and generated a chart. */
export type IntakeReviewLineage = {
 id:string;patient_id?:string|null;status?:string;
 identity?:{first_name?:string;last_name?:string}|null;
};
export function newPatientReviewIds(intakes:readonly IntakeReviewLineage[]):Set<string>{
 return new Set(intakes
  .filter(row=>row.status==='submitted'&&Boolean(row.patient_id)
   &&Boolean(row.identity?.first_name?.trim())&&Boolean(row.identity?.last_name?.trim()))
  .map(row=>row.id));
}
