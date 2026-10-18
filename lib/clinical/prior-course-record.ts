import {isClinicalId} from './identity.ts';

export type PriorCourseRecord={id:string;tester_id:string;patient_id:string;version:number;period_label:string;content:string;created_at:string};
export type PriorCourseInput={tester:string;patient_id:string;request_id:string;expected_version:number;period_label:string;content:string};
export function priorCourseInput(value:unknown):PriorCourseInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_prior_course');
 const v=value as PriorCourseInput;
 if(!isClinicalId(v.tester)||!isClinicalId(v.patient_id)||!isClinicalId(v.request_id)||!Number.isSafeInteger(v.expected_version)||v.expected_version<0||typeof v.period_label!=='string'||v.period_label.length>120||typeof v.content!=='string'||v.content.trim().length<15||v.content.length>12000)throw new Error('invalid_prior_course');
 return {...v,period_label:v.period_label.trim(),content:v.content.trim()};
}
export function confirmedPriorCourse(value:unknown,patientId:string,testerId:string,input?:PriorCourseInput):PriorCourseRecord{
 const v=(Array.isArray(value)?value[0]:value) as PriorCourseRecord|undefined;
 if(!v||!isClinicalId(v.id)||v.patient_id!==patientId||v.tester_id!==testerId||!Number.isSafeInteger(v.version)||v.version<1||typeof v.content!=='string'||typeof v.period_label!=='string'||!Number.isFinite(Date.parse(v.created_at)))throw new Error('prior_course_identity_unconfirmed');
 if(input&&(v.version!==input.expected_version+1||v.content!==input.content||v.period_label!==input.period_label))throw new Error('prior_course_save_unconfirmed');
 return v;
}
