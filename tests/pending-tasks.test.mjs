import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pendingTasks,pendingTaskHref,taskStatusChange,pendingListState} from '../lib/overview/pending-tasks.ts';
import {pendingTaskSnapshot} from '../lib/overview/pending-task-snapshot.ts';
import {fixtureTask,taskPatients,taskVisits} from '../lib/overview/pending-fixture.ts';
test('all drafts appear without finish-later writes; explicit task and derived draft deduplicate by visit',()=>{
 const linked={...fixtureTask,id:'linked',source_session_id:taskVisits[0].id};
 const before=JSON.stringify({linked,taskVisits,taskPatients});
 const rows=pendingTasks([linked,linked,fixtureTask],taskVisits,taskPatients);
 assert.equal(rows.length,3);assert.equal(rows.filter(t=>t.source_session_id===taskVisits[0].id).length,1);
 assert.equal(rows.find(t=>t.source_session_id===taskVisits[0].id).id,'linked');
 assert.equal(rows.find(t=>t.source_session_id===taskVisits[1].id).derived,true);
 assert.equal(JSON.stringify({linked,taskVisits,taskPatients}),before);
});
test('only completed visit disappears; manual tasks and other drafts survive, without title matching',()=>{
 const linked={...fixtureTask,id:'linked',source_session_id:taskVisits[0].id};
 const visits=taskVisits.map((v,i)=>i===0?{...v,status:'completed'}:v);
 const rows=pendingTasks([linked,fixtureTask],visits,taskPatients);
 assert.equal(rows.length,2);assert.ok(rows.some(t=>t.id===fixtureTask.id));assert.ok(rows.some(t=>t.source_session_id===taskVisits[1].id));
 assert.ok(!rows.some(t=>t.id==='linked'));
});
test('navigation retains exact patient and visit, even for equal patient names',()=>{
 const patients=taskPatients.map(p=>({...p,first_name:'Ίδιο',last_name:'Όνομα'}));
 const rows=pendingTasks([],taskVisits,patients);
 for(const visit of taskVisits){const row=rows.find(t=>t.source_session_id===visit.id);assert.equal(pendingTaskHref(row),'/patients/demo/'+visit.patient_id+'?tab=record&session='+visit.id)}
 assert.equal(pendingTaskHref(fixtureTask),'/patients/demo/'+fixtureTask.patient_id);
 assert.equal(pendingTaskHref({...fixtureTask,patient_id:null}),null);
});
test('mismatched patient linkage is never reused, and missing/deleted patients do not create broken links',()=>{
 const wrong={...fixtureTask,source_session_id:taskVisits[1].id};
 const rows=pendingTasks([wrong],taskVisits,taskPatients);
 assert.equal(rows.find(t=>t.source_session_id===taskVisits[1].id).derived,true);
 assert.equal(pendingTasks([],taskVisits,[]).length,0);
});
test('manual completion and undo retain the same task; visit tasks cannot be manually completed or reopened',()=>{
 assert.deepEqual(taskStatusChange(fixtureTask,'completed'),{action:'set_status',id:fixtureTask.id,status:'completed'});
 const completed={...fixtureTask,status:'completed'};
 assert.equal(pendingTasks([completed],[],taskPatients).length,0);
 assert.equal(taskStatusChange(completed,'open').id,fixtureTask.id);
 assert.equal(pendingTasks([{...completed,status:'open'}],[],taskPatients).length,1);
 for(const status of ['open','completed'])assert.throws(()=>taskStatusChange({...fixtureTask,source_session_id:taskVisits[0].id},status),/καταχώριση/);
});
test('due dates sort first; completed work is excluded; loading or failed reads never become an empty success',()=>{
 const early={...fixtureTask,id:'early',due_at:'2026-01-01T10:00:00Z'},later={...fixtureTask,id:'later',due_at:'2026-02-01T10:00:00Z'};
 assert.deepEqual(pendingTasks([later,early,{...fixtureTask,id:'done',status:'completed'}],[],taskPatients).map(t=>t.id),['early','later']);
 assert.equal(pendingListState('loading',false,0),'loading');
 assert.equal(pendingListState('error',false,0),'error');
 assert.equal(pendingListState('ready',true,0),'stale');
 assert.equal(pendingListState('ready',false,0),'empty');
});
test('snapshot reads all pages with workspace scope and never issues a mutation/bootstrap',async()=>{
 const patients=Array.from({length:501},(_,i)=>({id:'patient-'+i,first_name:'Συνθετικός',last_name:String(i)}));
 const visits=patients.map((p,i)=>({id:'visit-'+i,patient_id:p.id,status:'draft',started_at:taskVisits[0].started_at,updated_at:taskVisits[0].updated_at}));
 const paths=[];
 const result=await pendingTaskSnapshot(async path=>{
  paths.push(path);assert.ok(path.includes('tester_id=eq.workspace-A'));assert.ok(path.includes('order=id.asc'));
  assert.ok(!/rpc|bootstrap/.test(path));
  const params=new URLSearchParams(path.split('?')[1]),offset=Number(params.get('offset')),limit=Number(params.get('limit'));
  return (path.startsWith('demo_sessions')?visits:patients).slice(offset,offset+limit);
 },'workspace-A',[]);
 assert.equal(result.length,501);assert.equal(paths.length,4);assert.ok(result.some(t=>t.source_session_id==='visit-500'));
});
test('a failed or malformed source rejects the snapshot instead of silently showing zero',async()=>{
 await assert.rejects(pendingTaskSnapshot(async()=>{throw new Error('offline')},'workspace-A',[]),/offline/);
 await assert.rejects(pendingTaskSnapshot(async()=>({error:'denied'}),'workspace-A',[]),/invalid_pending_snapshot/);
});
