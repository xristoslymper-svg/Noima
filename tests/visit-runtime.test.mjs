import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visitBundle} from '../lib/patients/visit-runtime.ts';

test('visit bundle rejects ambiguous name-based patient routes before any lookup',async()=>{
 await assert.rejects(visitBundle('00000000-0000-4000-8000-000000000001','Μαρία'),/patient_not_found/);
});
