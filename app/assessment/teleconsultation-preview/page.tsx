import {notFound} from 'next/navigation';
import {previewEnabled} from '@/lib/teleconsultations/policy';
import TeleGuestPreview from '@/components/teleconsultations/TeleGuestPreview';
export const dynamic='force-dynamic';
export const metadata={title:'psi-space · Δοκιμή πρόσκλησης',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function Page(){if(!previewEnabled(process.env))notFound();return <TeleGuestPreview/>}
