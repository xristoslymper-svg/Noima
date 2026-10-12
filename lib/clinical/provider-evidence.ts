// Minimise structured identifiers before leaving the application. Free-text
// notes are still sensitive clinical data: this is NOT anonymisation.
const omitted=new Set(['patient_id','tester_id','patient_name','first_name','last_name','email','phone','address','amka','approved_by','created_by','updated_by']);
export function providerEvidence(value:unknown):unknown{
 if(Array.isArray(value))return value.map(providerEvidence);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!omitted.has(key)).map(([key,item])=>[key,providerEvidence(item)]));
 return value;
}
