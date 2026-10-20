import {readRecovery,writeRecovery} from '../clinical/browser-recovery.ts';
export const emptyPatientForm={firstName:'',lastName:'',age:'',phone:'',landline:'',contactPhone:'',amka:'',address:'',email:'',complaint:''};
export type PatientForm=typeof emptyPatientForm;
export type PatientIdentity={id:string;first_name:string;last_name:string;reported_age?:number|null;phone?:string;landline?:string;contact_phone?:string;email?:string;registry_number?:number};
export const normalizePatientText=(value:string)=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('el').replace(/\s+/g,' ').trim();
export function patientMatches(patient:PatientIdentity,query:string){
 const text=normalizePatientText(query);if(!text)return true;
 const fields=[patient.first_name,patient.last_name,patient.email||'',String(patient.registry_number||'')];
 const words=text.split(' ');
 if(words.every(word=>normalizePatientText(fields.join(' ')).includes(word)))return true;
 const digits=query.replace(/\D/g,'');
 return digits.length>=2&&/^[-+()\d\s.]+$/.test(query)&&[patient.phone,patient.landline,patient.contact_phone].some(value=>(value||'').replace(/\D/g,'').includes(digits));
}
export function patientIdentityHint(patient:PatientIdentity){
 return [patient.reported_age!=null?patient.reported_age+' ετών':'',patient.phone||patient.landline||patient.contact_phone||'',patient.email||''].filter(Boolean).join(' · ')||'Χωρίς στοιχεία επικοινωνίας';
}
export function possiblePatientMatches(patients:PatientIdentity[],form:PatientForm){
 const first=normalizePatientText(form.firstName),last=normalizePatientText(form.lastName),phone=form.phone.replace(/\D/g,''),email=normalizePatientText(form.email);
 return patients.filter(p=>(first.length>=2&&normalizePatientText(p.first_name)===first&&(!last||normalizePatientText(p.last_name)===last))||(phone.length>=7&&[p.phone,p.landline,p.contact_phone].some(v=>(v||'').replace(/\D/g,'')===phone))||(email.length>3&&normalizePatientText(p.email||'')===email));
}
export const patientFormKey=(owner:string)=>owner?'noima-new-patient:'+owner:null;
type RecoveryStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function recoverPatientForm(storage:RecoveryStorage,owner:string):PatientForm|null{
 const key=patientFormKey(owner);if(!key)return null;
 const raw=readRecovery(storage,key);if(!raw)return null;
 try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Object.keys(emptyPatientForm).some(k=>typeof value[k]!=='string'))return null;return Object.fromEntries(Object.keys(emptyPatientForm).map(k=>[k,value[k]])) as PatientForm}catch{return null}
}
export function persistPatientForm(storage:RecoveryStorage,owner:string,value:PatientForm){
 const key=patientFormKey(owner);if(!key)return;
 if(!Object.values(value).some(Boolean)){clearPatientForm(storage,owner);return}
 writeRecovery(storage,key,JSON.stringify(value));
}
export function clearPatientForm(storage:Pick<Storage,'removeItem'>,owner:string){
 const key=patientFormKey(owner);if(key){storage.removeItem(key);storage.removeItem(key+':expires')}
}
export const clinicDay=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function hasOlderDraft(drafts:{started_at:string}[],now=new Date().toISOString()){return drafts.some(d=>clinicDay(d.started_at)<clinicDay(now))}
