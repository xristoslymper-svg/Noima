import {notFound} from 'next/navigation';
import IndependentVisitPreview from '@/components/patients/IndependentVisitPreview';
export default function Page(){if(process.env.VERCEL_ENV==='production')notFound();return <IndependentVisitPreview customization/>}
