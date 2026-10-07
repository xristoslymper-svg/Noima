import test from 'node:test';
import assert from 'node:assert/strict';
import {mseFieldSentence,mseChangeSentences} from '../lib/clinical/mse-language.ts';
const field=(key,text,review='changed')=>({key,label:key,text,review});
const doc=(...fields)=>({kind:'mse',fields});

test('recognized MSE choices become natural sentences without inferred domains',()=>{
 assert.equal(mseFieldSentence(field('mood','Υποκειμενικό συναίσθημα: Αγχώδες')),'Καταγράφεται αγχώδες συναίσθημα.');
 assert.equal(mseFieldSentence(field('speech','Ρυθμός: Συνήθης\nΈνταση: Συνήθης')),'Ο λόγος καταγράφεται με συνήθη ρυθμό και συνήθη ένταση.');
 assert.equal(mseFieldSentence(field('affect','Εύρος: Πλήρες')),'Το εύρος της συναισθηματικής έκφρασης καταγράφεται ως πλήρες.');
 assert.equal(mseFieldSentence(field('speech','Ρυθμός: Βραδύς')),'Ο λόγος καταγράφεται με βραδύ ρυθμό.');
 assert.equal(mseFieldSentence(field('mood','Υποκειμενικό συναίσθημα: Ευθυμικό','not_assessed')),'');
});

test('free text, uncertain findings, negation and timing remain verbatim',()=>{
 const note='Χθες ανέφερε άγχος. Σήμερα δεν αποκλείεται ευερεθιστότητα.';
 assert.ok(mseFieldSentence(field('mood','Υποκειμενικό συναίσθημα: Αγχώδες\n'+note)).includes('«'+note+'»'));
 assert.match(mseFieldSentence(field('perception','Αντίληψη: Δεν αναφέρονται διαταραχές')),/Δεν αναφέρονται διαταραχές/);
 assert.ok(!mseFieldSentence(field('perception','Αντίληψη: Δεν αναφέρονται διαταραχές')).includes('φυσιολογ'));
});

test('removed choices mean not recorded, never clinical resolution; missing observations are not comparisons',()=>{
 const old=doc(field('mood','Υποκειμενικό συναίσθημα: Αγχώδες · Ευερέθιστο'));
 const current=doc(field('mood','Υποκειμενικό συναίσθημα: Αγχώδες'));
 const [text]=mseChangeSentences(current,old,{});
 assert.match(text,/παραμένει καταγεγραμμένο αγχώδες συναίσθημα/);
 assert.match(text,/δεν καταγράφεται πλέον ευερεθιστότητα/);
 assert.ok(!/υποχώρησε|βελτιώθηκε|δεν υπάρχει/.test(text));
 assert.deepEqual(mseChangeSentences(doc(field('mood','')),old,{}),[]);
 assert.deepEqual(mseChangeSentences(current,doc(field('mood','Υποκειμενικό συναίσθημα: Αγχώδες','not_assessed')),{}),[]);
});

test('narrative edits and changes in other domains retain both exact observations',()=>{
 const old=doc(field('speech','Ρυθμός: Βραδύς'));
 const now=doc(field('speech','Ρυθμός: Συνήθης'));
 assert.match(mseChangeSentences(now,old,{speech:'Λόγος'})[0],/«Ρυθμός: Βραδύς» σε «Ρυθμός: Συνήθης»/);
 const earlier=doc(field('mood','Υποκειμενικό συναίσθημα: Αγχώδες\nΑβέβαιη αναφορά.'));
 assert.match(mseChangeSentences(doc(field('mood','Υποκειμενικό συναίσθημα: Αγχώδες\nΝέα σημείωση.')),earlier,{mood:'Συναίσθημα'})[0],/Αβέβαιη αναφορά.*Νέα σημείωση/s);
});
