export type SearchablePatient = {id:string;first_name:string;last_name:string};
export function normalizePatientSearch(value:string):string {
 return value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('el-GR').replace(/ς/g,'σ').trim().replace(/\s+/g,' ');
}
export function suggestedPatients<T extends SearchablePatient>(patients:readonly T[],input:string,limit=8):T[]{
 const query=normalizePatientSearch(input);
 if(query.replace(/\s/g,'').length<2)return [];
 const terms=query.split(' ').filter(Boolean);
 return patients.filter(patient=>{
  const name=normalizePatientSearch(patient.first_name+' '+patient.last_name);
  return terms.every(term=>name.includes(term));
 }).slice(0,limit);
}
