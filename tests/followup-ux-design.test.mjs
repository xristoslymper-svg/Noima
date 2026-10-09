import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const followup=readFileSync('components/patients/FollowupClosure.tsx','utf8');
const css=readFileSync('components/patients/FollowupClosure.module.css','utf8');
const detailed=readFileSync('components/patients/PatientSession.tsx','utf8');
const medication=readFileSync('components/patients/MedicationTable.tsx','utf8');

test('new recording is not date-blocked: unfinished medication must point to its own row',()=>{
 const workspace=readFileSync('components/patients/PatientWorkspace.tsx','utf8');
 assert.match(workspace,/if\(appointment&&.*!confirmed\)/);
 assert.match(workspace,/await beforeNavigate\.current\?\.\(\)/);
 assert.match(medication,/newRowRef\.current\?\.scrollIntoView/);
 assert.match(medication,/Αποθηκεύστε ή ακυρώστε εδώ/);
 assert.match(medication,/Ακύρωση νέου φαρμάκου/);
});

test('follow-up presents a single next-visit focus field and distinct appointment card',()=>{
 assert.match(followup,/Στην επόμενη επίσκεψη/);
 assert.match(followup,/placeholder="Τι ανέφερε ο ασθενής, ποια ήταν η πορεία του, τι άλλαξε σήμερα…"/);
 assert.doesNotMatch(followup,/Μετρήσεις & επόμενο ραντεβού/);
 assert.match(followup,/<summary>Ψυχομετρικές μετρήσεις<\/summary>/);
 assert.match(followup,/className=\{styles\.appointmentCard\} aria-label="Επόμενο ραντεβού"/);
 assert.ok(followup.indexOf('className={styles.appointmentCard}')>followup.indexOf('Ψυχομετρικές μετρήσεις'));
 assert.ok(followup.indexOf('className={styles.appointmentCard}')>followup.indexOf('Σημαντικά θέματα για τη συνέχεια'));
 assert.doesNotMatch(followup,/Με την οριστικοποίηση επιβεβαιώνετε ότι/);
 assert.match(followup,/Ολοκλήρωση καταγραφής/);
});

test('signposting is by field placeholder instead of long doctor-facing explanations',()=>{
 assert.match(followup,/placeholder=\{\{clinical_state_summary:/);
 assert.match(followup,/Σημαντικά θέματα για τη συνέχεια/);
 assert.match(followup,/Τι αξίζει να θυμόμαστε/);
 assert.match(followup,/Συμπτώματα, λειτουργικότητα, μεταβολές/);
 assert.doesNotMatch(followup,/Η πρόταση δεν αλλάζει αγωγή ή εκτίμηση κινδύνου/);
 assert.match(css,/max-width:1180px/);
 assert.match(css,/\.details>summary::before/);
});

test('detailed visit also separates clinical plan from calendar scheduling',()=>{
 assert.match(detailed,/title="Θεραπευτικό πλάνο και επανεκτίμηση"/);
 assert.match(detailed,/title="Επόμενο ραντεβού"/);
 const appointment=readFileSync('components/patients/VisitNextAppointment.tsx','utf8');
 assert.match(appointment,/showHeading=true/);
 assert.match(detailed,/showHeading=\{false\}/);
 assert.match(appointment,/Επιλογές υπενθύμισης/);
});
