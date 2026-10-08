import {NextResponse} from 'next/server';
import {searchMedicationCatalog} from '@/lib/medications/catalog';

export const dynamic='force-dynamic';

export async function GET(request:Request){
 const url=new URL(request.url);
 const query=(url.searchParams.get('q')||'').trim();
 if(query.length<1)return NextResponse.json({items:[]});
 return NextResponse.json({items:searchMedicationCatalog(query,12)});
}
