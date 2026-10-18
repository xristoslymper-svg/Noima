import {notFound} from 'next/navigation';
import ReceivedHistoryPreview from '@/components/patients/ReceivedHistoryPreview';
export const dynamic='force-dynamic';
export default function ReceivedHistoryPreviewPage(){
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='codex/patient-journey-on-111')notFound();
 return <ReceivedHistoryPreview/>;
}
