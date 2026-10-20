import {notFound} from 'next/navigation';
import RegistryColumnsPreview from '@/components/patients/RegistryColumnsPreview';
export default function Page(){if(process.env.VERCEL_ENV==='production')notFound();return <RegistryColumnsPreview/>}
