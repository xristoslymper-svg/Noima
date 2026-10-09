// A remote history/intake update is safe to adopt only when there are no
// outstanding local edits, or when the local text already equals the remote.
export function shouldAdoptClinicalDraftServer({
 localJson,savedJson,incomingJson,localVersion,incomingVersion,
}:{
 localJson:string;
 savedJson:string;
 incomingJson:string;
 localVersion:number|null;
 incomingVersion:number|null;
}){
 const remoteChanged=localVersion!==incomingVersion||savedJson!==incomingJson;
 return remoteChanged&&(localJson===savedJson||localJson===incomingJson);
}
