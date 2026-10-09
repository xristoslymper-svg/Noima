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

/** A recovered browser draft must not force a stale clinical overwrite. */
export function recoveredClinicalDraftDisposition({
 recoveredJson,serverJson,recoveredVersion,serverVersion,
}:{
 recoveredJson:string;serverJson:string;recoveredVersion:number|null;serverVersion:number|null;
}):'same'|'archive'|'retry'{
 if(recoveredJson===serverJson)return 'same';
 if(recoveredVersion!==serverVersion)return 'archive';
 return 'retry';
}
