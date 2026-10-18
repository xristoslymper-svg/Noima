import {emptyContinuity} from '../clinical/continuity.ts';
import type {FixtureRecord} from './preview';
export const demoPatients=[{id:'10000000-0000-4000-8000-000000000006',name:'Σοφία Δείγμα',first:'Σοφία',last:'Δείγμα'},{id:'tele-demo-patient-nikos',name:'Νίκος Παράδειγμα',first:'Νίκος',last:'Παράδειγμα'}] as const;
export type DemoTelePatient=typeof demoPatients[number];
export function findDemoPatients(query:string){const q=query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el');return q.length<2?[]:demoPatients.filter(p=>p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el').includes(q))}
export function newDemoVisit(patientId:string,now:number,nonce:string):FixtureRecord{
 if(!demoPatients.some(p=>p.id===patientId)||!Number.isFinite(now)||!/^[a-f0-9-]{36}$/.test(nonce))throw new Error('Μη έγκυρη συνθετική συνεδρία.');
 const sessionId='tele-demo-'+nonce;
 return {patientId,sessionId,version:0,notes:{...emptyContinuity},assignments:[],appointment:{id:'tele-demo-appointment-'+nonce,patient_id:patientId,session_id:sessionId,status:'scheduled',scheduled_start:new Date(now).toISOString(),scheduled_end:new Date(now+50*60000).toISOString()}};
}
export type DemoInvitation={token:string;patientId:string;sessionId:string;expiresAt:number};
/** Public synthetic preview data only. NOT a bearer credential or a real room authorization token. */
export function demoInvitation(record:FixtureRecord,now:number,nonce:string):DemoInvitation{
 const index=demoPatients.findIndex(p=>p.id===record.patientId);
 if(index<0||record.appointment.patient_id!==record.patientId||record.appointment.session_id!==record.sessionId||record.appointment.status!=='scheduled'||!/^tele-[a-z0-9-]{4,90}$/.test(record.sessionId)||!/^[a-f0-9-]{36}$/.test(nonce)||!Number.isFinite(now))throw new Error('Μη έγκυρη συνθετική πρόσκληση.');
 const expiresAt=Math.floor(now/1000)+3600;
 return {token:['demo',1,index,record.sessionId,expiresAt,nonce].join('~'),patientId:record.patientId,sessionId:record.sessionId,expiresAt};
}
export function readDemoInvitation(token:string,now:number):DemoInvitation|null{
 const fields=token.split('~');if(fields.length!==6||fields[0]!=='demo'||fields[1]!=='1'||!/^\d$/.test(fields[2])||!/^tele-[a-z0-9-]{4,90}$/.test(fields[3])||!/^\d{10}$/.test(fields[4])||!/^[a-f0-9-]{36}$/.test(fields[5]))return null;
 const patient=demoPatients[Number(fields[2])],expiresAt=Number(fields[4]),seconds=Math.floor(now/1000);
 if(!patient||!Number.isFinite(now)||expiresAt<=seconds||expiresAt>seconds+3600)return null;
 return {token,patientId:patient.id,sessionId:fields[3],expiresAt};
}
