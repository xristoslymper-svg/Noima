import type {IntakeIdentity} from './history.ts';

export type DemographicProblem='first_name'|'last_name'|'age'|'email'|'amka'|'phone'|'contact_phone'|'address';
const digitAmka=/^\d{11}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Identifying information only. No history, diagnostic or clinical fields. */
export function normalizeIntakeIdentity(raw:Partial<IntakeIdentity>):IntakeIdentity {
 return {
  first_name:String(raw.first_name||'').trim().slice(0,120),
  last_name:String(raw.last_name||'').trim().slice(0,120),
  age:String(raw.age||'').trim(),
  phone:String(raw.phone||'').trim(),
  email:String(raw.email||'').trim().toLowerCase(),
  amka:String(raw.amka||'').replace(/\s/g,''),
  address:String(raw.address||'').trim(),
  contact_phone:String(raw.contact_phone||'').trim()
 };
}
export function checkIntakeIdentity(raw:Partial<IntakeIdentity>):DemographicProblem|null {
 const value=normalizeIntakeIdentity(raw);
 if(!value.first_name)return 'first_name';
 if(!value.last_name)return 'last_name';
 if(value.age&&(!/^\d{1,3}$/.test(value.age)||Number(value.age)>120))return 'age';
 if(value.amka&&!digitAmka.test(value.amka))return 'amka';
 if(value.email&&(value.email.length>254||!emailPattern.test(value.email)))return 'email';
 if(value.phone.length>60)return 'phone';
 if(value.contact_phone.length>60)return 'contact_phone';
 if(value.address.length>255)return 'address';
 return null;
}
