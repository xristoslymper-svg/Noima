import assert from 'node:assert/strict';
import {test} from 'node:test';
import {overviewSelectionState, restoreOverviewSelection} from '../lib/overview/selection.ts';

test('Back restores the selected second patient without replacing Next router history',()=>{
  const router={__NA:true,tree:['overview']};
  const entry=overviewSelectionState(router,{workspace:'doctor-a',day:'2026-10-09',patientId:'second'});
  assert.equal(restoreOverviewSelection(entry,'doctor-a','2026-10-09',['first','second']),'second');
  assert.deepEqual(entry.tree,router.tree);
  assert.equal(entry.__NA,true);
  assert.equal(router.noimaOverview,undefined);
  assert.equal(restoreOverviewSelection(router,'doctor-a','2026-10-09',['first','second']),null);
});

test('a different day, workspace, removed or cancelled appointment cannot restore stale context',()=>{
  const entry=overviewSelectionState(null,{workspace:'doctor-a',day:'2026-10-09',patientId:'second'});
  assert.equal(restoreOverviewSelection(entry,'doctor-b','2026-10-09',['second']),null);
  assert.equal(restoreOverviewSelection(entry,'doctor-a','2026-10-10',['second']),null);
  assert.equal(restoreOverviewSelection(entry,'doctor-a','2026-10-09',['first']),null);
  assert.equal(restoreOverviewSelection(entry,'doctor-a','2026-10-09',[]),null);
  assert.equal(restoreOverviewSelection(entry,'','2026-10-09',['second']),null);
});

test('malformed or absent selection is ignored and subsequent selection replaces only its own state',()=>{
  for(const entry of [null,undefined,{},'bad',{noimaOverview:null},{noimaOverview:{patientId:1}}])
    assert.equal(restoreOverviewSelection(entry,'a','2026-10-09',['first']),null);
  const original={__NA:true,noimaOverview:{workspace:'a',day:'2026-10-09',patientId:'first'}};
  const next=overviewSelectionState(original,{workspace:'a',day:'2026-10-09',patientId:'second'});
  assert.equal(restoreOverviewSelection(next,'a','2026-10-09',['first','second']),'second');
  assert.equal(original.noimaOverview.patientId,'first');
});
