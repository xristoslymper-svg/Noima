import {googleMapsPreview} from '@/lib/presence/google-maps';
import {notFound} from 'next/navigation';
import {hostedEnabled} from '@/lib/presence/public-policy';
import PresenceConnected from '@/components/presence/PresenceConnected';
import {previewEnabled} from '@/lib/presence/model';
export const dynamic='force-dynamic';
export const metadata={title:'Ψηφιακή παρουσία · NOIMA',robots:{index:false,follow:false}};
export default function Page(){if(!previewEnabled(process.env))notFound();return <PresenceConnected hosted={hostedEnabled(process.env)} googleMaps={googleMapsPreview(process.env)}/>}