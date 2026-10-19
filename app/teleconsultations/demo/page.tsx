import {notFound} from 'next/navigation';
import TeleconsultationsPreview from '@/components/teleconsultations/TeleconsultationsPreview';
export const dynamic='force-dynamic';
export default function Demo(){
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='codex/tele-meeting-first')notFound();
 return <TeleconsultationsPreview/>;
}
