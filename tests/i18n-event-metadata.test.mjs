import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTranslator} from 'next-intl';
import {recordEventText,translateUiLabel} from '../i18n/static-text.ts';
const en=JSON.parse(readFileSync('i18n/messages/en.json','utf8'));
const t=createTranslator({locale:'en',messages:en,onError:e=>{throw e}});
const display=value=>translateUiLabel(value,key=>t(key));
test('visit titles and completion metadata are localized without changing the event',()=>{
 const original={kind:'visits',title:'Επανεξέταση',detail:'Οι σημειώσεις έχουν αποθηκευτεί. Η επίσκεψη δεν έχει καταχωριστεί οριστικά.'};
 const before=structuredClone(original),result=recordEventText(original,display);
 assert.equal(result.title,'Follow-up visit');assert.match(result.detail,/Notes saved/);assert.deepEqual(original,before);
});
test('medication narrative, including an exact UI-looking phrase, remains verbatim',()=>{
 const detail='Σερτραλίνη · Δεν έχει καταγραφεί · λέξεις του γιατρού';
 const result=recordEventText({kind:'treatment',title:'Αλλαγή αγωγής',detail},display);
 assert.equal(result.detail,detail);assert.match(result.title,/change/i);
});
test('measurement identifiers and scores stay unchanged while linkage metadata is localized',()=>{
 const event={kind:'measurements',title:'PHQ-9 · 9',detail:'Ολοκληρωμένη μέτρηση · Απευθείας σύνδεση με κλινική επίσκεψη'};
 const result=recordEventText(event,display);
 assert.equal(result.title,event.title);assert.match(result.detail,/Completed measurement/);assert.doesNotMatch(result.detail,/[Α-Ωα-ω]/);
});
