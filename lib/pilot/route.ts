import { pilotClient } from './server';
import { pilotScope } from './request-scope';

// Verify the cookie with Auth; never authorize from a supplied tester ID.
export function withPilot(handler:(request:Request)=>Promise<Response>, publicAssessment=false) {
  return async (request:Request):Promise<Response> => {
    if(request.method!=='GET' && request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)
      return Response.json({error:'Μη έγκυρη προέλευση.'},{status:403});
    let body:Record<string,unknown>|null=null;
    if (request.headers.get('content-type')?.includes('application/json')) {
      const parsed=await request.clone().json().catch(()=>null);
      if(parsed && typeof parsed==='object' && !Array.isArray(parsed)) body=parsed;
    }
    if(publicAssessment && (body?.action==='open'||body?.action==='submit')) return handler(request);
    const client=await pilotClient();
    const {data:{user},error}=await client.auth.getUser();
    if(error||!user) return Response.json({error:'Συνδεθείτε για να συνεχίσετε.',code:'unauthenticated'},{status:401});
    const {data:identity,error:membershipError}=await client.rpc('pilot_identity');
    if(membershipError||!identity) return Response.json({error:'Ολοκληρώστε τη δημιουργία του προσωπικού σας χώρου.',code:'workspace_required'},{status:403});
    const {data:{session}}=await client.auth.getSession();
    if(!session) return Response.json({error:'Η σύνδεση έληξε.'},{status:401});
    const url=new URL(request.url);url.searchParams.set('tester',identity.workspace_id);
    const scoped=new Request(url, {
      method:request.method,headers:request.headers,
      ...(request.method==='GET'||request.method==='HEAD'?{}:{body:body?JSON.stringify({...body,tester:identity.workspace_id}):await request.arrayBuffer()}),
    });
    const response=await pilotScope.run({token:session.access_token,workspace:identity.workspace_id},()=>handler(scoped));
    response.headers.set('Cache-Control','private, no-store');
    return response;
  };
}
