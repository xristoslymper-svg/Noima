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

test('AI suggestions are never pinned without explicit clinician opt-in',()=>{
 const current={...emptyContinuity,clinical_state_summary:'Κλινική καταγραφή του γιατρού'};
 const proposal={...emptyContinuity,clinical_state_summary:'Νέα πρόταση',pinned_context:'Σημαντική παρουσίαση τον επόμενο μήνα.',source:'ai_assisted'};
 const ordinary=mergeContinuityProposal(current,proposal);
 assert.equal(ordinary.pinned_context,'');
 assert.equal(ordinary.clinical_state_summary,'Νέα πρόταση');
 const pinned=mergeContinuityProposal(current,proposal,{includeSuggestedContext:true});
 assert.equal(pinned.pinned_context,proposal.pinned_context);
 assert.equal('approved_at' in pinned,false);
 const existing={...current,pinned_context:'Επιβεβαιωμένο προηγούμενο θέμα'};
 assert.equal(mergeContinuityProposal(existing,proposal).pinned_context,existing.pinned_context);
});
