import {buildClinicalCard} from '@/lib/clinical/clinical-card';
import {providerEvidence} from '@/lib/clinical/provider-evidence';
import { withPilot } from '@/lib/pilot/route';
import {patientBundle,request,rpc} from '@/lib/patients/demo-runtime';
import {isClinicalId} from '@/lib/clinical/identity';
import {buildSummaryContext,summaryReadiness,minimumBriefingItems,canonicalSummaryFindings,summaryContextHash,validateNarrative,assertCriticalCoverage,SUMMARY_POLICY_VERSION,type Finding,type Evidence} from '@/lib/clinical/summary-context';
export const runtime='nodejs';
export const preferredRegion='fra1';
export const dynamic='force-dynamic';
export const maxDuration=120;
const model=process.env.OPENAI_CLINICAL_MODEL||'gpt-6-luna';
const CLINICAL_WRITING_PROMPT=`ROLE
Write a longitudinal Greek clinical orientation for the treating psychiatrist before the next encounter. Support a 1–2 minute review of the whole patient record, not a recap of the last visit.

CONTENT AND STRUCTURE
ΚΕΝΤΡΙΚΗ ΟΔΗΓΙΑ ΓΡΑΦΗΣ (ελληνικά): Μην γράφεις αναφορά επισκέψεων. Σύνθεσε την πορεία σε 2–5 σύντομα, αυτόνομα bullets, με φυσικά, απλά αλλά ακριβή κλινικά ελληνικά. Επίλεξε τι έχει ουσιαστική σημασία. Απόφυγε jargon και περιττές επαναλήψεις. Μη γεμίζεις τεχνητά ενότητες. Αν υπάρχουν���q�^