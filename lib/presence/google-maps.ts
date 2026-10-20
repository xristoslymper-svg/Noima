export const googleMapsBranch='codex/google-maps-foundation';
export function googleMapsPreview(env:Record<string,string|undefined>){return env.VERCEL_ENV==='production'||(env.VERCEL_ENV==='preview'&&[googleMapsBranch,'codex/public-booking-calendar'].includes(env.VERCEL_GIT_COMMIT_REF||''))}
// Deliberately code-locked. Credentials or an environment flag cannot activate Google.
export function googleMapsLiveEnabled(){return false}
export const profileFields=['phone','city','hours','website'] as const;
export type ProfileField=typeof profileFields[number];
export type Business={id:string;name:string;phone:string;city:string;hours:string;website:string};
export const syntheticBusiness:Business={id:'synthetic-location-1',name:'Ιατρείο Άννας Δείγμα · Συνθετικό',phone:'2100000000',city:'Αθήνα',hours:'Δευτέρα–Παρασκευή, 09:00–17:00',website:'https://practice.example'};
export const fieldLabels:Record<ProfileField,string>={phone:'Τηλέφωνο',city:'Πόλη / περιοχή',hours:'Ωράριο',website:'Ιστοσελίδα'};
export function differences(local:Business,remote:Business){return profileFields.filter(key=>local[key].trim()!==remote[key].trim())}
export function applyDemoChanges(local:Business,remote:Business,fields:ProfileField[],confirmed:boolean):Business{
 if(!confirmed)throw new Error('Χρειάζεται επιβεβαίωση.');
 if(remote.id!==syntheticBusiness.id||local.id!==syntheticBusiness.id)throw new Error('Μόνο συνθετικό ιατρείο.');
 if(new Set(fields).size!==fields.length||fields.some(key=>!profileFields.includes(key)))throw new Error('Μη έγκυρα πεδία.');
 return {...remote,...Object.fromEntries(fields.map(key=>[key,local[key]]))};
}
