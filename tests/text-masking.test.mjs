import test from 'node:test';
import assert from 'node:assert/strict';
import {maskProviderPayload,createClinicalMasker} from '../lib/clinical/text-masking.ts';
test('known patient aliases are masked in Greek Unicode/case variants without damaging clinical facts',()=>{
 const identity={first_name:'Μαρία',last_name:'Δοκιμαστική',email:'known@example.invalid',phone:'2101234567',amka:'12345678901',address:'Οδός Δείγματος 77'};
 const raw={note:'ΜΑΡΙΑ ΔΟΚΙΜΑΣΤΙΚΗ αναφέρει αϋπνία στις 2026-09-10. Fictional A 20 mg. 12/27 PHQ-9.',question:'Τι άλλαξε στον ύπνο της Μαρίας;',previous:{answer:'Μαρία Δοκιμαστική, known@example.invalid, +30 210 123 4567, 12345678901, Οδός Δείγματος 77'}};
 const encoded=JSON.stringify(maskProviderPayload(raw,identity));
 assert.doesNotMatch(encoded,/ΜΑΡΙΑ|ΔΟΚΙΜΑΣΤΙΚΗ|Μαρίας|known@|210\s*123|12345678901|Οδός Δείγματος/);
 assert.match(encoded,/2026-09-10/);assert.match(encoded,/Fictional A 20 mg/);assert.match(encoded,/12\/27 PHQ-9/);
 assert.equal(raw.question,'Τι άλλαξε στον ύπνο της Μαρίας;');
 assert.match(maskProviderPayload('Μαρι\u0301α',identity),/\[ΑΣΘΕΝΗΣ\]/);
});
test('notes seed one request-local registry for entities in questions and conversation',()=>{
 const seed={note:'Εργοδότης: Εργοστάσιο Δείγμα Άλφα; μητέρα: Άννα Κανελλοπούλου; διεύθυνση: Οδός Δείγματος 77.'};
 const payload={question:'Μετά το Εργοστάσιο Δείγμα Άλφα;',previous:{question:'Η Άννα Κανελλοπούλου;',answer:'Οδός Δείγματος 77'}};
 const output=JSON.stringify(maskProviderPayload(payload,{},seed));
 assert.doesNotMatch(output,/Εργοστάσιο|Κανελλοπούλου|Οδός/);
 assert.match(output,/ΣΥΓΓΕΝΗΣ/);
 assert.equal(maskProviderPayload('Εργοστάσιο Δείγμα Άλφα'), 'Εργοστάσιο Δείγμα Άλφα','no cross-request dictionary');
});
test('generic contacts and labelled identifiers are removed; clinical family history remains',()=>{
 const text='Email x.y+test@example.invalid; τηλέφωνο +44 7700 900123; ΑΜΚΑ 12345678901; ΑΦΜ: 123456789; εργοδότης: Δοκιμή ΑΕ; μητέρα: κατάθλιψη. 2026-08-10, 5 mg, GAD-7 12.';
 const masked=maskProviderPayload(text);
 assert.doesNotMatch(masked,/@|7700|123456789|Δοκιμή ΑΕ/);
 assert.match(masked,/μητέρα: κατάθλιψη/);assert.match(masked,/2026-08-10, 5 mg, GAD-7 12/);
 assert.equal(maskProviderPayload(masked),masked);
});
test('registry stats contain only counts and preserve primitive values',()=>{
 const masker=createClinicalMasker({first_name:'Νεφέλη'});
 assert.deepEqual(masker.mask({score:12,completed:true,value:null}),{score:12,completed:true,value:null});
 masker.mask('Νεφέλη x@example.invalid');
 assert.ok(masker.stats().replacements>=2);
 assert.deepEqual(Object.keys(masker.stats()),['replacements']);
});

test('clinical dates with times are not mistaken for spaced phone numbers',()=>{
 const raw='Επίσκεψη 2026-09-10 12:00, επανέλεγχος 2026.10.14 09:30. PHQ-9 12.';
 assert.equal(maskProviderPayload(raw),raw);
 assert.match(maskProviderPayload('Τηλέφωνο 210 999 8888'),/\[ΤΗΛΕΦΩΝΟ\]/);
});

test('different named relatives remain distinguishable after masking',()=>{
 const seed='μητέρα: Άννα Κανελλοπούλου; σύζυγος: Πέτρος Δοκιμαστικός.';
 const masked=maskProviderPayload({question:'Άννα Κανελλοπούλου και Πέτρος Δοκιμαστικός'}, {}, seed);
 assert.match(masked.question,/\[ΣΥΓΓΕΝΗΣ_1\] και \[ΣΥΓΓΕΝΗΣ_2\]/);
});

test('capitalised relative labels mask names while preserving clinical descriptions',()=>{
 const raw='Μητέρα: Άννα Κανελλοπούλου; ΠΑΤΕΡΑΣ: ΠΕΤΡΟΣ ΔΟΚΙΜΑΣΤΙΚΟΣ; μητέρα: κατάθλιψη σε ύφεση.';
 const masked=maskProviderPayload(raw);
 assert.doesNotMatch(masked,/Κανελλοπούλου|ΔΟΚΙΜΑΣΤΙΚΟΣ/);
 assert.match(masked,/μητέρα: κατάθλιψη σε ύφεση/);
});
