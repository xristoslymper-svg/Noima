import test from 'node:test';
import assert from 'node:assert/strict';
import {documentedChanges} from '../lib/clinical/summary.ts';

test('summary compares completed sources only and keeps absent information distinct from negative',()=>{
 const bundle={sessions:[{id:'draft',status:'draft'},{id:'old',status:'completed',completed_at:'2026-09-01'},{id:'new',status:'completed',completed_at:'2026-10-01'}],sections:[{session_id:'old',section_key:'assessment',content:'Unchanged'},{session_id:'new',section_key:'assessment',content:'Unchanged'},{session_id:'draft',section_key:'interview',content:'Unapproved draft'},{session_id:'new',section_key:'interview',content:'Patient reports no panic attacks.'}],risks:[{session_id:'old',suicidal_ideation:'not_assessed'},{session_id:'new',suicidal_ideation:'negative'}]};
 const changes=documentedChanges(bundle);
 assert.equal(changes.length,2);
 assert.equal(changes[0].before,'Δεν καταγράφηκε');
 assert.equal(changes[0].after,'Patient reports no panic attacks.');
 assert.equal(changes[1].before,'Δεν διερευνήθηκε');
 assert.equal(changes[1].after,'Αρνητικό');
 for(const change of changes){assert.equal(change.beforeId,'old');assert.equal(change.afterId,'new');}
});

test('summary does not manufacture a comparison without two completed sources',()=>{
 assert.deepEqual(documentedChanges({sessions:[{id:'one',status:'completed',completed_at:'2026-10-01'}]}),[]);
});
