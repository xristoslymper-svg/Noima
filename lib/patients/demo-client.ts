import { getDemoTesterId } from '@/lib/demo-tester';
export async function demoPost(body:Record<string,unknown>){
 const response=await fetch('/api/patients/demo/runtime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,tester:getDemoTesterId()})});
 const data=await response.json().catch(()=>({})); if(!response.ok)throw new Error(data.error||'Η ενέργεια δεν ολοκληρώθηκε.'); return data;
}
