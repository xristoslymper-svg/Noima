import assert from 'node:assert/strict';
import {before, after, test} from 'node:test';
import {createHash, randomUUID} from 'node:crypto';
import {createExistingPatientApi} from './support/existing-patient-api.mjs';
import {documentForm, syntheticDischarge, syntheticHistory, syntheticPhq, syntheticPdf} from './support/synthetic-existing-documents.mjs';

let api, doctor, outsider;
before(async () => {
  api = await createExistingPatientApi();
  doctor = await api.db.clinician('QA Synthetic Documents Doctor');
  outsider = await api.db.clinician('QA Synthetic Other Documents Workspace');
});
after(async () => { await api?.close(); });
const json = async response => {
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
};
const upload = async (patient, bytes, options = {}) => (await json(await api.request(doctor, '/api/patients/documents', documentForm(patient.id, options.id || randomUUID(), bytes, options)))).document;
const fetchOriginal = (actor, patient, document, download = false) => api.request(actor, '/api/patients/documents?patient_id=' + patient.id + '&id=' + document.id + (download ? '&download=1' : ''));
const historyFields = ['psychiatric_history','medical_history','previous_treatments','hospitalizations','family_history','substance_history','social_functioning','allergies'];
const extraction = (overrides = {}) => ({
  kind: 'PHQ-9', patient_name: 'QA SYNTHETIC existing patient', administration_date: '2021-06-15',
  reported_total: 12, answers: [2,2,1,1,1,1,1,1,null],
  history: Object.fromEntries(historyFields.map(field => [field, {text: '', attribution: 'document', needs_review: false}])),
  uncertainties: [{field: 'answers.8', issue: 'Unclear source mark'}], ...overrides,
});
const parse = async (patient, document, result, id = randomUUID()) => {
  api.setProviderResult(result);
  return json(await api.request(doctor, '/api/intake/scan', {mode: 'historical', action: 'parse', patient_id: patient.id, request_id: id, document_ids: [document.id]}));
};

test('B: actual document API stores private original bytes, metadata and audit events without clinical writes or AI calls', async () => {
  const patient = await api.db.patient(doctor);
  const bytes = syntheticDischarge(), deferred = api.deferred.length;
  const document = await upload(patient, bytes, {title: 'QA discharge', category: 'discharge', document_date: '2020-04-10'});
  assert.equal(document.patient_id, patient.id);
  assert.equal(document.actor_id, doctor.id);
  assert.equal(document.document_date, '2020-04-10');
  assert.equal(document.state, 'ready');
  assert.equal(document.sha256, createHash('sha256').update(bytes).digest('hex'));
  const listed = await json(await api.request(doctor, '/api/patients/documents?patient_id=' + patient.id));
  assert.deepEqual(listed.documents.map(row => row.id), [document.id]);
  for (const download of [false, true]) {
    const original = await fetchOriginal(doctor, patient, document, download);
    assert.equal(original.status, 200);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
    assert.equal(original.headers.get('cache-control'), 'private, no-store');
    assert.equal(original.headers.get('x-content-type-options'), 'nosniff');
    assert.match(original.headers.get('content-security-policy'), /sandbox/);
    assert.ok(original.headers.get('content-disposition').startsWith(download ? 'attachment;' : 'inline;'));
  }
  const bucket = (await api.db.admin('select public from storage.buckets where id=$1', ['patient-documents']))[0];
  assert.equal(bucket.public, false);
  const audits = await api.db.admin('select action,actor_id from private.demo_document_audit where document_id=$1 order by created_at', [document.id]);
  assert.deepEqual(audits.map(row => row.action), ['uploaded', 'preview', 'download']);
  assert.ok(audits.every(row => row.actor_id === doctor.id));
  assert.equal(api.deferred.length, deferred);
  assert.equal((await api.db.admin('select count(*)::int n from public.demo_sessions where patient_id=$1', [patient.id]))[0].n, 0);
});

test('B/G: retries recover lost upload responses, preserve the original and reject reuse for different content', async () => {
  const patient = await api.db.patient(doctor), id = randomUUID(), bytes = syntheticDischarge();
  api.faults.lostUploadResponse = 1;
  const first = await upload(patient, bytes, {id});
  const retry = await upload(patient, bytes, {id});
  assert.equal(first.id, retry.id);
  assert.equal((await api.db.admin('select count(*)::int n from storage.objects where name=$1', [first.object_name]))[0].n, 1);
  assert.equal((await api.db.admin("select count(*)::int n from private.demo_document_audit where document_id=$1 and action='uploaded'", [id]))[0].n, 1);
  const changed = await api.request(doctor, '/api/patients/documents', documentForm(patient.id, id, syntheticPdf(['DIFFERENT QA SYNTHETIC SOURCE'])));
  assert.equal(changed.status, 409);
  const otherPatient = await api.db.patient(doctor);
  assert.equal((await api.request(doctor, '/api/patients/documents', documentForm(otherPatient.id, id, bytes))).status, 409);
  assert.deepEqual(Buffer.from(await (await fetchOriginal(doctor, patient, first)).arrayBuffer()), bytes);
});

test('G: document authorization, storage RLS and immutable linking deny another workspace and another patient', async () => {
  const patient = await api.db.patient(doctor), otherPatient = await api.db.patient(doctor);
  const document = await upload(patient, syntheticDischarge());
  assert.equal((await fetchOriginal(outsider, patient, document)).status, 404);
  assert.equal((await fetchOriginal(doctor, otherPatient, document)).status, 404);
  assert.equal((await fetchOriginal(null, patient, document)).status, 401);
  assert.equal((await api.request(outsider, '/api/patients/documents', documentForm(patient.id, randomUUID()))).status, 404);
  assert.equal((await api.db.query(doctor.id, 'select id from storage.objects where name=$1', [document.object_name])).length, 1);
  assert.deepEqual(await api.db.query(outsider.id, 'select id from storage.objects where name=$1', [document.object_name]), []);
  await assert.rejects(api.db.query(null, 'select id from storage.objects'), /permission denied/);
  await assert.rejects(api.db.query(doctor.id, 'insert into storage.objects(bucket_id,name) values($1,$2)', ['patient-documents', doctor.workspace + '/' + patient.id + '/' + randomUUID() + '.pdf']), /row-level security/);
  await assert.rejects(api.db.query(doctor.id, "update storage.objects set name='changed.pdf' where name=$1", [document.object_name]), /permission denied/);
  await assert.rejects(api.db.admin('update private.demo_patient_documents set patient_id=$1 where id=$2', [otherPatient.id, document.id]), /document_immutable/);
  await assert.rejects(api.db.rpc(outsider.id, 'demo_document_get', {p_tester: doctor.workspace, p_patient: patient.id, p_id: document.id}), /pilot_not_authorized/);
});

test('G: malformed, active, mismatched and oversized uploads are rejected before storage', async () => {
  const patient = await api.db.patient(doctor);
  const attacks = [
    {bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), name: 'forged.pdf'},
    {bytes: Buffer.from('%PDF-1.7\n%%EOF'), name: 'truncated.pdf'},
    {bytes: syntheticDischarge(), name: 'wrong.png', type: 'image/png'},
    {bytes: syntheticPdf(['QA source']).toString().replace('/Type /Catalog', '/Type /Catalog /OpenAction << /S /JavaScript /JS (alert(1)) >>'), name: 'active.pdf'},
    {bytes: new Uint8Array(3 * 1024 * 1024 + 1), name: 'huge.pdf', status: 413},
  ];
  for (const attack of attacks) {
    const response = await api.request(doctor, '/api/patients/documents', documentForm(patient.id, randomUUID(), attack.bytes, attack));
    assert.equal(response.status, attack.status || 422, attack.name + ': ' + await response.text());
  }
  assert.deepEqual((await json(await api.request(doctor, '/api/patients/documents?patient_id=' + patient.id))).documents, []);
});

test('G: a stored-byte integrity mismatch fails closed on authorized retrieval', async () => {
  const patient = await api.db.patient(doctor), document = await upload(patient, syntheticDischarge());
  const key = 'patient-documents/' + document.object_name;
  const original = api.objects.get(key);
  api.objects.set(key, {...original, bytes: syntheticPdf(['QA SYNTHETIC corrupted transport bytes'])});
  const response = await fetchOriginal(doctor, patient, document);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'document_integrity_failed');
  api.objects.set(key, original);
});

test('C: historical PHQ-9 without assignment code requires review, retains uncertainty and saves corrected answers with source linkage', async () => {
  const patient = await api.db.patient(doctor), document = await upload(patient, syntheticPhq(), {name: 'synthetic-phq.pdf'});
  const scheduled = api.deferred.length;
  const {scan} = await parse(patient, document, extraction());
  assert.equal(scan.state, 'ready');
  assert.equal(scan.extracted.answers[8], null);
  assert.equal(scan.extracted.reported_total, 12);
  assert.equal(api.deferred.length, scheduled);
  assert.deepEqual(await api.db.rpc(doctor.id, 'demo_historical_measurement_list', {p_tester: doctor.workspace, p_patient: patient.id}), []);
  const review = {kind: 'PHQ-9', administered_on: '2021-06-15', score: 12, answers: [2,2,1,1,1,1,1,1,2], note: 'QA source reviewed'};
  const request = {patient_id: patient.id, request_id: scan.id, approved: true, review};
  assert.equal((await api.request(doctor, '/api/patients/documents/import', {...request, approved: false})).status, 400);
  assert.equal((await api.request(doctor, '/api/patients/documents/import', {...request, review: {...review, answers: scan.extracted.answers}})).status, 422);
  const imported = await json(await api.request(doctor, '/api/patients/documents/import', request));
  assert.equal(imported.measurement.score, 12);
  assert.deepEqual(imported.measurement.answers, review.answers);
  assert.deepEqual(imported.measurement.document_ids, [document.id]);
  assert.equal(imported.measurement.source, 'historical_scan');
  assert.equal(imported.measurement.actor_id, doctor.id);
  const repeat = await json(await api.request(doctor, '/api/patients/documents/import', request));
  assert.equal(repeat.measurement.id, imported.measurement.id);
  const values = await json(await api.request(doctor, '/api/patients/demo/measurements?patient_id=' + patient.id));
  assert.equal(values.measurements[0].item9_review, true);
  assert.ok(values.measurements[0].item9_reviewed_at);
  assert.equal(values.measurements[0].session_id, null);
  assert.equal((await api.db.admin('select count(*)::int n from public.demo_risk_assessments where patient_id=$1', [patient.id]))[0].n, 0);
  assert.equal((await api.db.admin('select count(*)::int n from public.demo_sessions where patient_id=$1', [patient.id]))[0].n, 0);
});

test('C/G: total-only scanned measurement never acquires invented item answers and cross-patient originals cannot enter extraction', async () => {
  const patient = await api.db.patient(doctor), another = await api.db.patient(doctor);
  const document = await upload(patient, syntheticPhq(), {name: 'synthetic-total.pdf'});
  const {scan} = await parse(patient, document, extraction({answers: null, reported_total: 14, uncertainties: []}));
  const {measurement} = await json(await api.request(doctor, '/api/patients/documents/import', {
    patient_id: patient.id, request_id: scan.id, approved: true,
    review: {kind: 'PHQ-9', administered_on: '2021-06-15', score: 14, answers: null, note: ''},
  }));
  assert.equal(measurement.answers, null);
  const result = await json(await api.request(doctor, '/api/patients/demo/measurements?patient_id=' + patient.id));
  assert.equal(result.measurements[0].item9_review, false);
  const response = await api.request(doctor, '/api/intake/scan', {mode: 'historical', action: 'parse', patient_id: another.id, request_id: randomUUID(), document_ids: [document.id]});
  assert.equal(response.status, 404);
});

test('D: historical history import preserves existing text, approves selected additions and records source attribution', async () => {
  const patient = await api.db.patient(doctor);
  const existing = (await api.db.read(doctor.id, 'demo_patient_history?patient_id=eq.' + patient.id))[0];
  const original = 'QA SYNTHETIC known allergy retained';
  await json(await api.request(doctor, '/api/patients/demo/runtime', {action: 'save_history', patient_id: patient.id, history: {...existing, allergies: original}, expected_version: existing.version}));
  const saved = (await api.db.read(doctor.id, 'demo_patient_history?patient_id=eq.' + patient.id))[0];
  const document = await upload(patient, syntheticHistory(), {name: 'synthetic-history.pdf'});
  const extracted = extraction({kind: 'history', administration_date: null, reported_total: null, answers: null, uncertainties: []});
  extracted.history.allergies = {text: 'QA SYNTHETIC different allergy in document', attribution: 'document', needs_review: true};
  extracted.history.hospitalizations = {text: 'QA SYNTHETIC patient reports admission in 2018', attribution: 'patient_reported', needs_review: false};
  const {scan} = await parse(patient, document, extracted);
  assert.equal((await api.db.read(doctor.id, 'demo_patient_history?patient_id=eq.' + patient.id))[0].allergies, original);
  const review = {kind: 'history', expected_history_version: saved.version, additions: [{field: 'hospitalizations', text: extracted.history.hospitalizations.text, attribution: 'patient_reported'}]};
  const imported = await json(await api.request(doctor, '/api/patients/documents/import', {patient_id: patient.id, request_id: scan.id, approved: true, review}));
  assert.equal(imported.history.allergies, original);
  assert.equal(imported.history.hospitalizations, 'Αναφορά ασθενούς σε έγγραφο: ' + extracted.history.hospitalizations.text);
  const audits = await api.db.rpc(doctor.id, 'demo_history_import_list', {p_tester: doctor.workspace, p_patient: patient.id});
  assert.deepEqual(audits[0].document_ids, [document.id]);
  assert.equal(audits[0].before_history.allergies, original);
  assert.equal(audits[0].additions[0].attribution, 'patient_reported');
  assert.equal(audits[0].additions[0].text, extracted.history.hospitalizations.text, 'audit preserves approved source text separately from display attribution');
  assert.equal(audits[0].actor_id, doctor.id);
  assert.equal((await api.db.admin('select count(*)::int n from public.demo_sessions where patient_id=$1', [patient.id]))[0].n, 0);
});

test('D/G: equivalent history text is excluded and reimporting an attributed paragraph produces no duplicate or version change', async () => {
  const patient = await api.db.patient(doctor);
  const original = (await api.db.read(doctor.id, 'demo_patient_history?patient_id=eq.' + patient.id))[0];
  await json(await api.request(doctor, '/api/patients/demo/runtime', {action: 'save_history', patient_id: patient.id, history: {...original, allergies: 'QA SYNTHETIC known allergy'}, expected_version: original.version}));
  const history = (await api.db.read(doctor.id, 'demo_patient_history?patient_id=eq.' + patient.id))[0];
  const document = await upload(patient, syntheticHistory(), {name: 'equivalent-history.pdf'});
  const extracted = extraction({kind: 'history', administration_date: null, reported_total: null, answers: null, uncertainties: []});
  extracted.history.allergies = {text: 'qa synthetic  known allergy', attribution: 'document', needs_review: false};
  extracted.history.hospitalizations = {text: 'QA SYNTHETIC admission in 2018', attribution: 'patient_reported', needs_review: false};
  const {scan} = await parse(patient, document, extracted);
  const additions = [
    {field: 'allergies', text: extracted.history.allergies.text, attribution: 'document'},
    {field: 'hospitalizations', text: extracted.history.hospitalizations.text, attribution: 'patient_reported'},
  ];
  const imported = await json(await api.request(doctor, '/api/patients/documents/import', {patient_id: patient.id, request_id: scan.id, approved: true, review: {kind: 'history', expected_history_version: history.version, additions}}));
  assert.equal(imported.history.allergies, history.allergies);
  assert.equal(imported.history.hospitalizations, 'Αναφορά ασθενούς σε έγγραφο: ' + extracted.history.hospitalizations.text);
  const audit = await api.db.rpc(doctor.id, 'demo_history_import_list', {p_tester: doctor.workspace, p_patient: patient.id});
  assert.deepEqual(audit[0].additions, [additions[1]], 'only effective additions are audited');
  const {scan: repeated} = await parse(patient, document, extracted);
  const response = await api.request(doctor, '/api/patients/documents/import', {patient_id: patient.id, request_id: repeated.id, approved: true, review: {kind: 'history', expected_history_version: imported.history.version, additions}});
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'scan_no_changes');
  const after = (await api.db.read(doctor.id, 'demo_patient_history?patient_id=eq.' + patient.id))[0];
  assert.equal(after.version, imported.history.version);
  assert.equal(after.hospitalizations, imported.history.hospitalizations);
  assert.equal((await api.db.rpc(doctor.id, 'demo_history_import_list', {p_tester: doctor.workspace, p_patient: patient.id})).length, 1);
});

test('D/G: a stale history review rolls back the whole import and leaves it available for a fresh review', async () => {
  const patient = await api.db.patient(doctor), document = await upload(patient, syntheticHistory(), {name: 'stale-history.pdf'});
  const original = (await api.db.read(doctor.id, 'demo_patient_history?patient_id=eq.' + patient.id))[0];
  const extracted = extraction({kind: 'history', administration_date: null, reported_total: null, answers: null, uncertainties: []});
  extracted.history.allergies = {text: 'QA SYNTHETIC imported addition', attribution: 'document', needs_review: true};
  const {scan} = await parse(patient, document, extracted);
  await json(await api.request(doctor, '/api/patients/demo/runtime', {action: 'save_history', patient_id: patient.id, history: {...original, allergies: 'QA SYNTHETIC newer confirmed entry'}, expected_version: original.version}));
  const response = await api.request(doctor, '/api/patients/documents/import', {patient_id: patient.id, request_id: scan.id, approved: true, review: {kind: 'history', expected_history_version: original.version, additions: [{field: 'allergies', text: extracted.history.allergies.text, attribution: 'document'}]}});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'scan_stale_history');
  assert.equal((await api.db.read(doctor.id, 'demo_patient_history?patient_id=eq.' + patient.id))[0].allergies, 'QA SYNTHETIC newer confirmed entry');
  assert.deepEqual(await api.db.rpc(doctor.id, 'demo_history_import_list', {p_tester: doctor.workspace, p_patient: patient.id}), []);
  const pending = await api.db.rpc(doctor.id, 'demo_document_scan_get', {p_tester: doctor.workspace, p_patient: patient.id, p_request: scan.id});
  assert.equal(pending[0].state, 'ready');
});
