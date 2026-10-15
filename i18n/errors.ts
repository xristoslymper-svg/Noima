import {errorMessageKeys} from './error-catalog.ts';

// Additive metadata: established error codes and the original fallback message
// remain unchanged for existing clients. UI translation is performed by the client.
export function errorJson(body:Record<string,unknown>,init?:ResponseInit){
 const key=typeof body.error==='string'?errorMessageKeys[body.error as keyof typeof errorMessageKeys]:undefined;
 return Response.json({...body,code:body.code??key??'request_failed',message_key:key??'errors.requestFailed'},init);
}
