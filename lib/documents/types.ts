export const documentBucket='patient-documents';
export const maxDocumentBytes=3*1024*1024;
export const maxScanDocuments=6;
export const documentCategories=['discharge','opinion','tests','history','other'] as const;
export type DocumentCategory=typeof documentCategories[number];
export type PatientDocument={
 id:string;tester_id:string;patient_id:string;state:'pending'|'ready';object_name:string;
 original_name:string;title:string;category:DocumentCategory|null;document_date:string|null;
 media_type:'application/pdf'|'image/jpeg'|'image/png'|'image/webp';byte_size:number;sha256:string;
 actor_id:string;created_at:string;ready_at:string|null;
};
export const historySectionKeys=['psychiatric_history','medical_history','previous_treatments','hospitalizations','family_history','substance_history','social_functioning','allergies'] as const;
export type HistorySectionKey=typeof historySectionKeys[number];
export type HistoryAddition={field:HistorySectionKey;text:string;attribution:'document'|'patient_reported'};
export type HistoryImport={id:string;scan_id:string;document_ids:string[];additions:HistoryAddition[];actor_id:string;created_at:string;history_version:number};
export type ExtractedHistorySection={text:string;attribution:'document'|'patient_reported';needs_review:boolean};
export type HistoricalScanResult={
 kind:'PHQ-9'|'GAD-7'|'history'|'unknown';patient_name:string|null;administration_date:string|null;
 reported_total:number|null;answers:(number|null)[]|null;
 history:Partial<Record<HistorySectionKey,ExtractedHistorySection>>;
 uncertainties:{field:string;issue:string}[];patient_identity_check:boolean;
};
export type HistoricalScan={id:string;tester_id:string;patient_id:string;document_ids:string[];state:'extracting'|'failed'|'ready'|'approved';extracted:HistoricalScanResult|null;created_at:string};
export type HistoricalScanReview={
 kind:HistoricalScanResult['kind'];administered_on:string|null;score:number|null;answers:number[]|null;
 note:string;additions:HistoryAddition[];expected_history_version:number;patient_confirmed:boolean;
};
