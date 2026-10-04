import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialDocument,mseItems} from '../lib/clinical/visit-document.ts';
import {parseWhoSearch} from '../lib/clinical/icd10.ts';
test('MSE has twelve domains without inferred negatives or carried-forward observations',()=>{assert.equal(mseItems.length,12);const doc=initialDocument('mse');assert.equal(doc.fields.length,12);assert.ok(doc.fields.every(f=>f.text===''));assert.equal(initialDocument('mse','Legacy uncertain finding').fields.at(-1).text,'Legacy uncertain finding')});
test('WHO catalog parser keeps official editions and medical codes beyond psychiatry, deduplicates and strips markup',()=>{
 const html=['F32.9','I10','E11.9','F32.9'].map(code=>`<li data-stemid="http://id.who.int/icd/release/10/2019/${code}"><span class="titlelabel"><em>Clinical</em> &amp; diagnosis</span></li>`).join('');
 const codes=parseWhoSearch(html);assert.deepEqual(codes.map(c=>c.code),['F32.9','I10','E11.9']);assert.ok(codes.every(c=>c.edition==='2019'&&c.system==='WHO ICD-10'&&c.label==='Clinical & diagnosis'));assert.deepEqual(parseWhoSearch('<html>Service unavailable</html>'),[]);
});
