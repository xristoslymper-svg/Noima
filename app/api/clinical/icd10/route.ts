import {parseWhoSearch,WHO_ICD10_ROOT} from '@/lib/clinical/icd10';
export async function GET(req:Request){
 const query=new URL(req.url).searchParams.get('q')?.trim()||'';
 if(query.length<2||query.length>100)return Response.json({results:[],edition:'WHO ICD-10 2019'});
 try{const r=await fetch(WHO_ICD10_ROOT+'/ACSearch',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({q:query}),signal:AbortSignal.timeout(8000),cache:'no-store'});if(!r.ok)throw new Error('who_unavailable');const html=await r.text();if(!html.includes('searchresults'))throw new Error('invalid_catalog_response');return Response.json({results:parseWhoSearch(html).slice(0,30),edition:'WHO ICD-10 2019',source:WHO_ICD10_ROOT},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Η αναζήτηση WHO ICD-10 δεν είναι διαθέσιμη. Το κλινικό κείμενο παραμένει διαθέσιμο· προσθέστε κωδικούς αργότερα.'},{status:503})}
}
