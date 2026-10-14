// Shared incremental SSE decoder: tolerates UTF-8 and event boundaries across chunks.
export async function* sseData(body:ReadableStream<Uint8Array>):AsyncGenerator<string>{
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='';
 try{
  while(true){
   const {value,done}=await reader.read();
   buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
   let match:RegExpExecArray|null;
   while((match=/\r?\n\r?\n/.exec(buffer))){
    const block=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
    const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
    if(data)yield data;
   }
   if(buffer.length>1000000)throw new Error('copilot_stream_limit');
   if(done){if(buffer.trim())throw new Error('copilot_stream_interrupted');break;}
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
