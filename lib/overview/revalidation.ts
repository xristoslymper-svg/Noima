// Serial reads plus invalidation protect local writes from older snapshots.
export function createRevalidator<T>({load,apply,error}: {load:(signal:AbortSignal)=>Promise<T>;apply:(data:T)=>void;error:()=>void}) {
  let generation=0, busy=0, pending=false, disposed=false;
  let controller:AbortController|null=null;
  async function refresh() {
    if(disposed)return;
    if(busy){pending=true;return;}
    const version=++generation;
    controller?.abort();controller=new AbortController();
    const signal=controller.signal;
    try {const data=await load(signal);if(!disposed&&!signal.aborted&&version===generation)apply(data);}
    catch {if(!disposed&&!signal.aborted&&version===generation)error();}
  }
  return {refresh,
    beginMutation(){busy++;generation++;controller?.abort();pending=true;},
    endMutation(){busy=Math.max(0,busy-1);if(!busy&&pending){pending=false;void refresh();}},
    dispose(){disposed=true;generation++;controller?.abort();}
  };
}
