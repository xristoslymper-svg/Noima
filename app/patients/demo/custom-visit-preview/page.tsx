import {notFound} from 'next/navigation';
import CustomVisitPreview from '@/components/patients/CustomVisitPreview';
export default function Page(){if(process.env.VERCEL_ENV==='production')notFound();return <CustomVisitPreview/>}
