import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldAdoptClinicalDraftServer} from '../lib/clinical/draft-reconciliation.ts';

const evaluate=(local,saved,incoming,localVersion=1,incomingVersion=2)=>
 shouldAdoptClinicalDraftServer({
  localJson:JSON.stringify(local),savedJson:JSON.stringify(saved),incomingJson:JSON.stringify(incoming),localVersion,incomingVersion,
 });

test('approved patient intake refreshes a clean history editor without artificial conflict',()=>{
 const old={psychiatric_history:'',allergies:''};
 const approved={psychiatric_history:'Αναφορά ασθενούς: προηγούμενη διάγνωση',allergies:'Δεν έχει διερευνηθεί'};
 assert.equal(evaluate(old,old,approved),true);
 assert.equal(evaluate(old,old,old),true); // version itself advanced
 assert.equal(evaluate(old,old,old,1,1),false); // no update
});

test('incoming approval never overwrites unsaved independent clinician notes',()=>{
 const previous={psychiatric_history:'Προϋπάρχον ιστορικό',allergies:''};
 const edited={psychiatric_history:'Μη αποθηκευμένη κλινική διόρθωση',allergies:''};
 const reviewed={psychiatric_history:'Αναφορά ασθενούς',allergies:'Όχι γνωστές αλλεργίες'};
 assert.equal(evaluate(edited,previous,reviewed),false);
});

test('matching already-entered content can safely adopt latest server version',()=>{
 const previous={psychiatric_history:'Παλαιότερο'};
 const matching={psychiatric_history:'Εγκεκριμένη ενημέρωση'};
 assert.equal(evaluate(matching,previous,matching),true);
});

test('history navigation preserves unresolved local drafts instead of trapping the clinician',()=>{
 const source=readFileSync(new URL('../components/patients/PatientPanels.tsx',import.meta.url),'utf8');
 const hook=readFileSync(new URL('../components/patients/useClinicalDraft.ts',import.meta.url),'utf8');
 assert.match(source,/if\(!draft\.preserveConflictForNavigation\(\)\)await draft\.flush\(\)/);
 assert.match(hook,/sessionStorage\.setItem\(storageKey,JSON\.stringify\(\{value:latest\.current,version:v\.current\}\)\)/);
 assert.match(hook,/if\(!blocked\.current\)return false/);
 assert.match(hook,/if\(flight\.current\)return/);
 assert.match(source,/Κράτησε τις αλλαγές μου/);
});
