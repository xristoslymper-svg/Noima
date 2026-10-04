import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mseAxes,axisValues,toggleMseChoice} from '../lib/clinical/mse-options.ts';
test('MSE choices preserve free narrative, replace single choices, allow deselection and reload',()=>{
 const axis=mseAxes.appearance[0];const original='Περιποίηση: ο ασθενής εξηγεί τη δυσκολία του\nΠρόσθετη παρατήρηση.';
 let text=toggleMseChoice(original,axis,'Επαρκής');assert.ok(text.includes(original));assert.deepEqual(axisValues(text,axis),['Επαρκής']);
 text=toggleMseChoice(text,axis,'Παραμελημένη');assert.deepEqual(axisValues(text,axis),['Παραμελημένη']);assert.ok(text.includes(original));
 text=toggleMseChoice(text,axis,'Παραμελημένη');assert.equal(text,original);
});
test('MSE multiple findings never infer normal and perception absence excludes positive findings',()=>{
 const axis=mseAxes.thought_process[0];assert.deepEqual(axisValues('',axis),[]);let text=toggleMseChoice('',axis,axis.options[1]);text=toggleMseChoice(text,axis,axis.options[2]);assert.equal(axisValues(text,axis).length,2);
 const perception=mseAxes.perception[0];text=toggleMseChoice('',perception,'Δεν αναφέρονται διαταραχές');text=toggleMseChoice(text,perception,'Ψευδαισθήσεις');assert.deepEqual(axisValues(text,perception),['Ψευδαισθήσεις']);text=toggleMseChoice(text,perception,'Δεν αναφέρονται διαταραχές');assert.deepEqual(axisValues(text,perception),['Δεν αναφέρονται διαταραχές']);
});
