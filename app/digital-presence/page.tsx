import {notFound} from 'next/navigation';
import PresenceConnected from '@/components/presence/PresenceConnected';
import {previewEnabled} from '@/lib/presence/model';
export const dynamic='force-dynamic';
export const metadata={title:'Ψηφιακή παρουσία · NOIMA',robots:{index:false,follow:false}};
export default function Page(){if(!previewEnabled(process.env))notFound();return <PresenceConnected/>}