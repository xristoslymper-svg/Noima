export type WritingProvenance={kind:'dictation'|'ai';original:string;transcript:string;reviewed_text:string;model?:string;reviewed_at:string};
export type WritingPending={kind:'dictation'|'ai';base:string;text:string;transcript:string;model?:string;proposalId?:string};
export type WritingPhase='idle'|'permission'|'recording'|'paused'|'transcribing'|'ai'|'saving'|'review_dictation'|'review_ai'|'error';
export type WritingSnapshot={phase:WritingPhase;pending:WritingPending|null;error:string;confirmed:string};
export const appendDictation=(base:string,text:string)=>text.trim()?base+(base.trim()?'\n\n':'')+text.trim():base;
export const writingBusy=(phase:WritingPhase)=>['permission','recording','paused','transcribing','ai','saving'].includes(phase);
export function narrativeWritingRecovery(confirmed:string,entry?:import('./core-types').ClinicalProposal,raw='',legacy?:{text:string;manual:boolean;mode:string}):WritingPending{
 const writing=entry?.proposal.writing;
 const text=entry?.proposal.clinical_text??legacy?.text??raw;
 const replace=Boolean(writing)||!entry&&legacy?.mode==='replace';
 return {kind:writing?.kind||(entry?.model||legacy&&!legacy.manual?'ai':'dictation'),base:writing?.original??confirmed,text:replace?text:appendDictation(confirmed,text),transcript:entry?.transcript??raw,model:entry?.model||undefined,proposalId:entry?.id};
}
// Pending content is never passed to the autosaving draft. One controller belongs
// to one stable field identity; request tickets cannot be used in another field.
export class ClinicalWriting {
 snapshot:WritingSnapshot;private ticket=0;private revision=0;private requestedRevision=0;private notify:(value:WritingSnapshot)=>void;
 constructor(value:string,notify:(value:WritingSnapshot)=>void){this.notify=notify;this.snapshot={phase:'idle',pending:null,error:'',confirmed:value}}
 private publish(patch:Partial<WritingSnapshot>){this.snapshot={...this.snapshot,...patch};this.notify(this.snapshot)}
 sync(value:string){if(value!==this.snapshot.confirmed){this.revision++;this.publish({confirmed:value})}}
 display(){return this.snapshot.pending?.text??this.snapshot.confirmed}
 edit(value:string){if(this.snapshot.pending)this.publish({pending:{...this.snapshot.pending,text:value},error:''});else{this.revision++;this.publish({confirmed:value,error:''})}}
 start(phase:'permission'|'ai'){if(writingBusy(this.snapshot.phase)||this.snapshot.pending?.kind==='ai'||phase==='ai'&&this.snapshot.pending)return null;const id=++this.ticket;this.requestedRevision=this.revision;this.publish({phase,error:''});return id}
 current(id:number){return id===this.ticket}
 phase(phase:WritingPhase){this.publish({phase})}
 transcribed(id:number,text:string){if(!this.current(id))return;++this.ticket;const p=this.snapshot.pending;this.publish({phase:'review_dictation',pending:{kind:'dictation',base:p?.base??this.snapshot.confirmed,text:appendDictation(this.display(),text),transcript:appendDictation(p?.transcript??'',text)},error:''})}
 polished(id:number,base:string,text:string,model?:string){if(!this.current(id))return;if(this.snapshot.confirmed!==base||this.requestedRevision!==this.revision){this.publish({phase:'error',error:'Το κείμενο άλλαξε. Δοκιμάστε τη βελτίωση ξανά.'});return}this.publish({phase:'review_ai',pending:{kind:'ai',base,text,transcript:base,model},error:''})}
 recover(p:WritingPending){if(writingBusy(this.snapshot.phase)||this.snapshot.pending)return;this.publish({pending:p,phase:p.kind==='ai'?'review_ai':'review_dictation',error:''})}
 fail(id:number,error:string){if(this.current(id))this.publish({phase:'error',error})}
 error(error:string){this.publish({phase:'error',error})}
 stop(){++this.ticket;this.publish({phase:this.snapshot.pending?(this.snapshot.pending.kind==='ai'?'review_ai':'review_dictation'):'idle',error:''})}
 cancel(){++this.ticket;this.publish({pending:null,phase:'idle',error:''})}
 proposalId(id:string){if(this.snapshot.pending)this.publish({pending:{...this.snapshot.pending,proposalId:id}})}
 assertReview(){if(!this.snapshot.pending)throw new Error('Δεν υπάρχει κείμενο προς επιβεβαίωση.');if(this.snapshot.pending.base!==this.snapshot.confirmed)throw new Error('Η αρχική καταγραφή άλλαξε. Αντιγράψτε τις διορθώσεις σας και ελέγξτε τη νεότερη έκδοση πριν συνεχίσετε.');return this.snapshot.pending}
 accepted(text:string){this.publish({confirmed:text,pending:null,phase:'idle',error:''})}
 assertSafe(){if(this.snapshot.pending||writingBusy(this.snapshot.phase))throw new Error('Επιβεβαιώστε ή ακυρώστε πρώτα το κείμενο και ολοκληρώστε την υπαγόρευση.');}
}
export function recoverWriting(value:unknown):WritingPending|null{
 if(!value||typeof value!=='object')return null;const p=value as WritingPending;
 return (p.kind==='ai'||p.kind==='dictation')&&['base','text','transcript'].every(k=>typeof (p as unknown as Record<string,unknown>)[k]==='string'&&String((p as unknown as Record<string,unknown>)[k]).length<=100000)&&(!p.proposalId||typeof p.proposalId==='string')?p:null;
}
