import {notFound} from 'next/navigation';
import PendingTasksPreview from '@/components/overview/PendingTasksPreview';
import '../overview-search.css';
export const dynamic='force-dynamic';
export default function PendingPreview(){
 if(process.env.VERCEL_ENV!=='preview')notFound();
 return <PendingTasksPreview/>;
}
