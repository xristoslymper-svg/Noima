import {notFound} from 'next/navigation';
import TeleconsultationsPreview from '@/components/teleconsultations/TeleconsultationsPreview';
export const dynamic='force-dynamic';
export default function Demo(){
 if(process.env.VERCEL_ENV!=='preview'||!['codex/tele-meeting-first','codex/tele-ui-polish','codex/english-current-ui'].includes(process.env.VERCEL_GIT_COMMIT_REF||''))notFound();
 return <TeleconsultationsPreview/>;
}
