import {test} from 'node:test';
import assert from 'node:assert/strict';
import {riskTreePath,riskTreeHidden} from '../lib/clinical/risk-tree.ts';
test('risk tree reveals only the relevant branch and never changes stored answers',()=>{
 const answers={wish:'positive',acted:'negative',ideation:'active',intent:'unknown',plan:'positive'};
 assert.deepEqual(riskTreePath(answers),['wish','acted','ideation','intent','plan']);
 const tree={version:1,answers:{...answers,wish:'negative'},notes:{plan:'Requires further review'}};
 assert.deepEqual(riskTreePath(tree.answers),['wish','selfthoughts']);
 assert.deepEqual(riskTreeHidden(tree),['acted','ideation','intent','plan']);assert.equal(tree.answers.plan,'positive');
 assert.deepEqual(riskTreePath({wish:'positive',acted:'positive'}),['wish','acted','injury']);
 assert.deepEqual(riskTreePath({wish:'positive',acted:'negative',ideation:'passive'}),['wish','acted','ideation']);
 for(const wish of ['unknown','not_assessed'])assert.deepEqual(riskTreePath({wish}),['wish']);
});
