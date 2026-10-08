import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyContinuity,mergeContinuityProposal,validContinuity} from '../lib/clinical/continuity.ts';
test('missing AI facts cannot erase clinician-authored continuity or supply approval',()=>{
 const current={...emptyContinuity,adherence:'One missed dose',pinned_context:'Clinician pin',transcript:'Original words',treatment_decision:'Continue'};
 const proposed={...emptyContinuity,clinical_state_summary:'Patient reports improved sleep',source:'ai_assisted'};
 const merged=mergeContinuityProposal(current,proposed);
 assert.equal(merged.adherence,'One missed dose');assert.equal(merged.treatment_decision,'Continue');assert.equal(merged.pinned_context,'Clinician pin');assert.equal(merged.transcript,'Original words');assert.equal(merged.clinical_state_summary,proposed.clinical_state_summary);assert.equal('approved_at' in merged,false);assert.equal(current.source,'manual');
 assert.equal(validContinuity(merged),true);assert.equal(validContinuity({...merged,adherence:null}),false);assert.equal(validContinuity({...merged,source:'approved'}),false);
});
