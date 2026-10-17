import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {syntheticDischarge, syntheticHistory, syntheticPhq, syntheticPdf} from '../tests/support/synthetic-existing-documents.mjs';

// Invoked only by visit-application-api in its disposable local Supabase job.
// All clinical routes, Auth sessions, RPCs and Storage bytes are real. The AI
// gate stays disabled: only the browser's parse response is a declared fixture,
// backed by an authenticated, persisted scan whose original was really uploaded.
export async function existingPatientSupabase({browser, context, page, origin, api, owner, other, admin, out, size}) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(new URL(api).hostname, '127.0.0.1');
  assert.equal(new URL(api).port, '54321');
  assert.equal(new URL(origin).hostname, 'localhost');
  assert.equal(process.env.EXTERNAL_AI_ENABLED, 'false');
  const results = [], headers = {origin};
  const ok = async response => {
    const body = await response.json();
    assert.equal(response.status(), 200, String(body.code || body.error || response.status()));
    return body;
  };
  const post = async (path, data) => ok(await context.request.post(origin + path, {headers, data}));
  const get = async path => ok(await context.request.get(origin + path));
  const rpc = async (name, args, client = owner.client) => {
    const response = await client.rpc(name, args);
    assert.equal(response.error, null, name + ': ' + response.error?.message);
    return response.data;
  };
  const rows = async (table, patientId, client = owner.client) => {
    const response = await client.from(table).select('*').eq('patient_id', patientId);
    assert.equal(response.error, null, table + ': ' + response.error?.message);
    return response.data;
  };
  const stamp = (scenario, evidence) => results.push({scenario, status: 'passed', ...evidence});
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const bucketName = 'patient-documents';
  const {patient} = await post('/api/patients/demo/runtime', {action: 'create_patient', first_name: 'QA SYNTHETIC', last_name: 'existing patient'});
  const another = (await post('/api/patients/demo/runtime', {action: 'create_patient', first_name: 'QA SYNTHETIC', last_name: 'other patient'})).patient;
  const base = origin + '/patients/demo/' + patient.id;
  const manual = value => ({patient_id: patient.id, request_id: randomUUID(), instrument: 'PHQ-9', score: 14, administered_on: '2022-06-15', ...value});
  const list = () => get('/api/patients/documents?patient_id=' + patient.id);
  const original = document => '/api/patients/documents?patient_id=' + patient.id + '&id=' + document.id;
  const upload = async (bytes, name, id = randomUUID()) => {
    const response = await context.request.post(origin + '/api/patients/documents', {headers, multipart: {
      patient_id: patient.id, request_id: id,
      file: {name, mimeType: 'application/pdf', buffer: bytes},
    }});
    return (await ok(response)).document;
  };
  const noEncounters = async () => {
    assert.deepEqual(await rows('demo_sessions', patient.id), []);
    assert.deepEqual(await rows('demo_risk_assessments', patient.id), []);
    assert.deepEqual(await rpc('demo_assessment_list', {p_tester: owner.workspace, p_patient: patient.id}), []);
  };

  // A: use the production score form and persist through real cookie Auth/RPCs.
  await page.goto(base + '?tab=timeline');
  const measurements = page.locator('#patient-measurements');
  await measurements.getByRole('heading', {name: 'Μετρήσεις', exact: true}).waitFor();
  for (const [score, date] of [[14, '2022-06-15'], [19, '2020-02-10'], [7, '2023-09-12']]) {
    await measurements.getByRole('button', {name: 'Βαθμολογία', exact: true}).click();
    const form = measurements.getByRole('form', {name: 'Βαθμολογία', exact: true});
    assert.equal(await form.locator('input:visible,select:visible,textarea:visible').count(), 3);
    await form.getByLabel('Βαθμολογία', {exact: true}).fill(String(score));
    await form.getByLabel('Ημερομηνία εξέτασης', {exact: true}).fill(date);
    await form.getByRole('button', {name: 'Αποθήκευση', exact: true}).click();
    await form.waitFor({state: 'detached'});
  }
  const scores = (await get('/api/patients/demo/measurements?patient_id=' + patient.id)).measurements;
  assert.deepEqual(scores.map(row => [row.administered_on, row.score]), [['2023-09-12', 7], ['2022-06-15', 14], ['2020-02-10', 19]]);
  assert.ok(scores.every(row => row.answers === null && row.item9_review === false && row.session_id === null && row.appointment_id === null));
  assert.match(await measurements.getByRole('img', {name: /^PHQ-9/}).getAttribute('aria-label'), /2020.*19.*2022.*14.*2023.*7/);
  for (const value of [{score: 28}, {instrument: 'GAD-7', score: 22}, {answers: [1,1,1,1,1,1,1,1,1]}]) {
    assert.equal((await context.request.post(origin + '/api/patients/demo/measurements', {headers, data: manual(value)})).status(), 422);
  }
  const forgedScan = await owner.client.rpc('demo_historical_measurement_save', {p_tester: owner.workspace, p_patient: patient.id, p_request: randomUUID(), p_instrument: 'PHQ-9', p_score: 9, p_administered_on: '2020-01-01', p_source: 'historical_scan'});
  assert.match(forgedScan.error?.message || '', /invalid_measurement_source/);
  await noEncounters();
  await page.screenshot({path: resolve(out, size + '-existing-scores-real-supabase.png')});
  stamp('A: historical scores', {threeClinicalDates: true, chart: true, totalOnly: true, noEncounters: true});

  // B/G: attachment bytes cross actual Supabase Storage and its real policies.
  const dischargeBytes = syntheticDischarge();
  const document = await upload(dischargeBytes, 'QA-synthetic-discharge.pdf');
  assert.equal(document.patient_id, patient.id);
  assert.equal(document.state, 'ready');
  assert.equal(document.sha256, hash(dischargeBytes));
  const bucket = await admin.storage.getBucket(bucketName);
  assert.equal(bucket.error, null);
  assert.equal(bucket.data.public, false);
  assert.equal(Number(bucket.data.file_size_limit), 3 * 1024 * 1024);
  for (const download of ['', '&download=1']) {
    const response = await context.request.get(origin + original(document) + download);
    assert.equal(response.status(), 200);
    assert.deepEqual(await response.body(), dischargeBytes);
    assert.equal(response.headers()['cache-control'], 'private, no-store');
    assert.equal(response.headers()['x-content-type-options'], 'nosniff');
    assert.match(response.headers()['content-security-policy'], /sandbox/);
    assert.match(response.headers()['content-disposition'], download ? /^attachment;/ : /^inline;/);
  }
  const ownerObject = await owner.client.storage.from(bucketName).download(document.object_name);
  assert.equal(ownerObject.error, null);
  assert.deepEqual(Buffer.from(await ownerObject.data.arrayBuffer()), dischargeBytes);
  assert.equal((await upload(dischargeBytes, document.original_name, document.id)).id, document.id);
  assert.equal((await list()).documents.length, 1);
  const storageList = await owner.client.storage.from(bucketName).list(owner.workspace + '/' + patient.id);
  assert.equal(storageList.error, null);
  assert.equal(storageList.data.length, 1, 'retry creates exactly one actual Storage object');
  assert.equal(storageList.data[0].name, document.object_name.split('/').at(-1));
  assert.equal(Number(storageList.data[0].metadata.size), dischargeBytes.length);
  assert.equal(storageList.data[0].metadata.mimetype, 'application/pdf');
  const changed = await context.request.post(origin + '/api/patients/documents', {headers, multipart: {patient_id: patient.id, request_id: document.id, file: {name: document.original_name, mimeType: 'application/pdf', buffer: syntheticPdf(['QA DIFFERENT SYNTHETIC CONTENT'])}}});
  assert.equal(changed.status(), 409);
  const malformed = await context.request.post(origin + '/api/patients/documents', {headers, multipart: {patient_id: patient.id, request_id: randomUUID(), file: {name: 'QA-malformed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%%EOF')}}});
  assert.equal(malformed.status(), 422);
  const unauthorized = await browser.newContext();
  try {
    assert.equal((await unauthorized.request.get(origin + original(document))).status(), 401);
    const publicObject = await unauthorized.request.get(api + '/storage/v1/object/public/' + bucketName + '/' + document.object_name);
    assert.ok(publicObject.status() >= 400, 'private bucket must reject the public object endpoint');
    await ok(await unauthorized.request.post(origin + '/api/pilot', {headers, data: {action: 'login', email: other.email, password: other.password}}));
    assert.equal((await unauthorized.request.get(origin + original(document))).status(), 404);
    assert.equal((await unauthorized.request.get(origin + '/api/patients/demo/measurements?patient_id=' + patient.id)).status(), 404);
    assert.equal((await unauthorized.request.post(origin + '/api/patients/demo/measurements', {headers, data: manual({tester: owner.workspace})})).status(), 404);
    const otherObject = await other.client.storage.from(bucketName).download(document.object_name);
    assert.ok(otherObject.error, 'another workspace cannot download private object bytes');
    const otherList = await other.client.storage.from(bucketName).list(owner.workspace + '/' + patient.id);
    assert.equal(otherList.error, null);
    assert.deepEqual(otherList.data, []);
  } finally { await unauthorized.close(); }
  assert.equal((await context.request.get(origin + '/api/patients/documents?patient_id=' + another.id + '&id=' + document.id)).status(), 404);
  const differentPatient = await context.request.post(origin + '/api/patients/documents', {headers, multipart: {patient_id: another.id, request_id: document.id, file: {name: document.original_name, mimeType: 'application/pdf', buffer: dischargeBytes}}});
  assert.equal(differentPatient.status(), 409);
  const unregistered = await owner.client.storage.from(bucketName).upload(owner.workspace + '/' + patient.id + '/' + randomUUID() + '.pdf', dischargeBytes, {contentType: 'application/pdf'});
  assert.ok(unregistered.error, 'Storage INSERT requires an exact staged document');
  const overwrite = await owner.client.storage.from(bucketName).update(document.object_name, dischargeBytes, {contentType: 'application/pdf'});
  assert.ok(overwrite.error, 'immutable original cannot be overwritten through Storage');
  await owner.client.storage.from(bucketName).remove([document.object_name]);
  const retainedOriginal = await owner.client.storage.from(bucketName).download(document.object_name);
  assert.equal(retainedOriginal.error, null, 'Storage DELETE must leave the original intact');
  assert.deepEqual(Buffer.from(await retainedOriginal.data.arrayBuffer()), dischargeBytes);
  assert.equal((await list()).documents.length, 1, 'failed uploads did not create document records');
  stamp('B/G: private documents', {realStorage: true, byteIntegrity: true, privateBucket: true, publicAndOtherWorkspaceDenied: true, crossPatientDenied: true, immutableOriginal: true, retries: true, malformedRejected: true});

  // C/D: external AI remains disabled, including its real API boundary. Only
  // extraction is deterministic; uploads and final approval are never mocked.
  const blocked = await context.request.post(origin + '/api/intake/scan', {headers, data: {mode: 'historical', action: 'parse', patient_id: patient.id, request_id: randomUUID(), document_ids: [document.id]}});
  assert.equal(blocked.status(), 503);
  assert.equal((await blocked.json()).code, 'external_ai_disabled');
  let extracted, expectedOriginal, savedScan, seeded = 0;
  const parseFixture = async route => {
    const body = route.request().postDataJSON();
    assert.equal(body.mode, 'historical');
    assert.equal(body.action, 'parse');
    assert.equal(body.patient_id, patient.id);
    assert.equal(body.document_ids.length, 1);
    const documents = (await list()).documents;
    const linked = documents.find(row => row.id === body.document_ids[0]);
    assert.ok(linked && linked.patient_id === patient.id && linked.tester_id === owner.workspace);
    assert.equal(linked.sha256, hash(expectedOriginal));
    const source = await context.request.get(origin + original(linked));
    assert.equal(source.status(), 200);
    assert.deepEqual(await source.body(), expectedOriginal);
    const p_attempt = randomUUID();
    const parameters = {p_tester: owner.workspace, p_patient: patient.id, p_request: body.request_id, p_attempt};
    const started = await rpc('demo_document_scan_start', {...parameters, p_documents: body.document_ids});
    assert.equal(started.acquired, true);
    const finished = await rpc('demo_document_scan_finish', {...parameters, p_extracted: extracted});
    savedScan = Array.isArray(finished) ? finished[0] : finished;
    assert.equal(savedScan.state, 'ready');
    seeded += 1;
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({scan: savedScan})});
  };
  await page.route('**/api/intake/scan', parseFixture);
  const tabs = page.getByRole('navigation', {name: 'Καρτέλες φακέλου'});
  const openScan = async (bytes, name) => {
    await tabs.getByRole('button', {name: 'Ιστορικό', exact: true}).click();
    await page.locator('summary').filter({hasText: /^Προσθήκη$/}).click();
    await page.getByRole('button', {name: 'Σάρωση εντύπου', exact: true}).click();
    const dialog = page.getByRole('dialog');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.getByRole('button', {name: 'Επιλογή ή απόθεση αρχείου', exact: true}).click()]);
    await chooser.setFiles({name, mimeType: 'application/pdf', buffer: bytes});
    return dialog;
  };
  const pdfEvidence = [];
  const inspectPdf = async (dialog, name) => {
    const available = await page.evaluate(() => navigator.pdfViewerEnabled);
    const href = new URL(await dialog.getByRole('link', {name: 'Άνοιγμα', exact: true}).getAttribute('href'), origin).href;
    const response = await context.request.get(href);
    assert.equal(response.status(), 200);
    assert.deepEqual(await response.body(), expectedOriginal);
    if (!available) assert.equal(await dialog.locator('iframe').count(), 0);
    else {
      const frame = dialog.locator('iframe[title="Πρωτότυπο"]');
      await frame.waitFor();
      assert.equal(await frame.getAttribute('sandbox'), '');
      // A PDF-capable browser is not proof that a sandboxed PDF actually paints.
      // Keep the protected response unchanged and preserve images for visual QA.
      await frame.screenshot({path: resolve(out, size + '-pdf-' + pdfEvidence.length + '-protected-frame.png')});
      const originalTab = await context.newPage();
      let navigationError = null;
      try {
        await originalTab.goto(href, {waitUntil: 'load', timeout: 10000}).catch(error => { navigationError = error.message.split('\n')[0]; });
        await originalTab.locator('embed[type="application/pdf"]').waitFor({timeout: 3000}).catch(() => {});
        await originalTab.screenshot({path: resolve(out, size + '-pdf-' + pdfEvidence.length + '-protected-tab.png')});
      } finally { await originalTab.close(); }
      pdfEvidence.push({document: name, originalBytesMatch: true, nativeViewerAvailable: true, nativeRenderingVerified: false, visualInspectionRequired: true, navigationError});
      return;
    }
    pdfEvidence.push({document: name, originalBytesMatch: true, nativeViewerAvailable: available, fallbackVerified: !available, nativeRenderingVerified: false});
  };
  try {
    extracted = {kind: 'PHQ-9', patient_name: 'QA SYNTHETIC existing patient', administration_date: '2021-06-15', reported_total: 12, answers: [2,2,1,1,1,1,1,1,null], history: {}, uncertainties: [{field: 'answers.8', issue: 'QA unclear source mark'}], patient_identity_check: false};
    expectedOriginal = syntheticPhq();
    let dialog = await openScan(expectedOriginal, 'QA-PHQ9-no-code.pdf');
    await dialog.getByRole('heading', {name: 'PHQ-9', exact: true}).waitFor();
    assert.equal((await get('/api/patients/demo/measurements?patient_id=' + patient.id)).measurements.length, 3, 'extraction is not a measurement');
    const incomplete = {patient_id: patient.id, request_id: savedScan.id, approved: false, review: {kind: 'PHQ-9', administered_on: '2021-06-15', score: 12, answers: extracted.answers}};
    assert.equal((await context.request.post(origin + '/api/patients/documents/import', {headers, data: incomplete})).status(), 400);
    assert.equal((await context.request.post(origin + '/api/patients/documents/import', {headers, data: {...incomplete, approved: true}})).status(), 422);
    await dialog.getByRole('combobox', {name: 'Απάντηση 9', exact: true}).selectOption('1');
    assert.equal(await dialog.getByLabel('Βαθμολογία', {exact: true}).inputValue(), '11');
    assert.match(await dialog.innerText(), /12.*11/);
    await inspectPdf(dialog, 'historical PHQ-9');
    await page.screenshot({path: resolve(out, size + '-existing-phq-review-real-storage.png')});
    const approval = page.waitForResponse(response => response.url().includes('/api/patients/documents/import') && response.request().method() === 'POST');
    await dialog.getByRole('button', {name: 'Έγκριση και αποθήκευση', exact: true}).click();
    const committed = await approval;
    const written = await ok(committed);
    await dialog.waitFor({state: 'detached'});
    assert.equal(written.measurement.score, 11);
    assert.equal(written.measurement.answers[8], 1);
    assert.deepEqual(written.measurement.document_ids, savedScan.document_ids);
    assert.equal(written.measurement.source, 'historical_scan');
    const retry = await post('/api/patients/documents/import', committed.request().postDataJSON());
    assert.equal(retry.measurement.id, written.measurement.id);
    await noEncounters();
    stamp('C: historical questionnaire', {realUploadAndApproval: true, persistedExtractionFixture: true, liveExtraction: false, uncertainAnswerCorrected: true, discrepancy: true, originalLinked: true, idempotentApproval: true, noCurrentRiskAssessment: true});

    // A total-only import must keep item answers unknown even in the real stack.
    const totalRequest = randomUUID(), totalAttempt = randomUUID();
    const totalDocument = await upload(syntheticPdf(['QA SYNTHETIC PHQ-9 TOTAL ONLY', 'Patient: QA SYNTHETIC existing patient', 'Administration date: 2021-06-15', 'Reported total: 14', 'Individual answers are not present.']), 'QA-PHQ9-total-only.pdf');
    const totalParams = {p_tester: owner.workspace, p_patient: patient.id, p_request: totalRequest, p_attempt: totalAttempt};
    await rpc('demo_document_scan_start', {...totalParams, p_documents: [totalDocument.id]});
    await rpc('demo_document_scan_finish', {...totalParams, p_extracted: {...extracted, answers: null, reported_total: 14, uncertainties: []}});
    const totalOnly = await post('/api/patients/documents/import', {patient_id: patient.id, request_id: totalRequest, approved: true, review: {kind: 'PHQ-9', administered_on: '2021-06-15', score: 14, answers: null}});
    assert.equal(totalOnly.measurement.answers, null);
    assert.deepEqual(totalOnly.measurement.document_ids, [totalDocument.id]);
    const totalRow = (await get('/api/patients/demo/measurements?patient_id=' + patient.id)).measurements.find(row => row.id === totalOnly.measurement.id);
    assert.equal(totalRow.item9_review, false);

    let history = (await rows('demo_patient_history', patient.id))[0];
    await post('/api/patients/demo/runtime', {action: 'save_history', patient_id: patient.id, expected_version: history.version, history: {...history, allergies: 'QA SYNTHETIC known allergy retained'}});
    await page.reload();
    extracted = {kind: 'history', patient_name: 'QA SYNTHETIC existing patient', administration_date: null, reported_total: null, answers: null, history: {
      allergies: {text: 'QA SYNTHETIC different allergy in source', attribution: 'document', needs_review: true},
      hospitalizations: {text: 'QA SYNTHETIC reported admission in 2018', attribution: 'patient_reported', needs_review: false},
    }, uncertainties: [], patient_identity_check: false};
    expectedOriginal = syntheticHistory();
    dialog = await openScan(expectedOriginal, 'QA-historical-history.pdf');
    await dialog.getByRole('heading', {name: 'Παλιό ιστορικό', exact: true}).waitFor();
    assert.equal(await dialog.getByRole('checkbox').count(), 2);
    assert.equal(await dialog.getByRole('checkbox', {name: /Αλλεργίες/}).isChecked(), false);
    assert.equal(await dialog.getByRole('checkbox', {name: /Νοσηλείες/}).isChecked(), true);
    assert.equal((await rows('demo_patient_history', patient.id))[0].allergies, 'QA SYNTHETIC known allergy retained');
    await inspectPdf(dialog, 'historical psychiatric history');
    await page.screenshot({path: resolve(out, size + '-existing-history-review-real-storage.png')});
    await dialog.getByRole('button', {name: 'Έγκριση και αποθήκευση', exact: true}).click();
    await dialog.waitFor({state: 'detached'});
    history = (await rows('demo_patient_history', patient.id))[0];
    assert.equal(history.allergies, 'QA SYNTHETIC known allergy retained');
    assert.equal(history.hospitalizations, 'Αναφορά ασθενούς σε έγγραφο: ' + extracted.history.hospitalizations.text);
    const imports = await rpc('demo_history_import_list', {p_tester: owner.workspace, p_patient: patient.id});
    assert.equal(imports.length, 1);
    assert.deepEqual(imports[0].document_ids, savedScan.document_ids);
    assert.equal(imports[0].additions[0].attribution, 'patient_reported');
    await noEncounters();
    stamp('D: historical history', {realApprovalAndVersioning: true, existingAllergyRetained: true, selectedAddition: true, sourceAttribution: true, originalLinked: true});
  } finally { await page.unroute('**/api/intake/scan', parseFixture); }
  assert.equal(seeded, 2);

  // E/F: continuing medication and the next scheduled appointment require no visit.
  await tabs.getByRole('button', {name: 'Θεραπεία', exact: true}).click();
  await page.getByRole('button', {name: 'Αγωγή', exact: true}).click();
  const medicationRow = page.locator('.med-new-row');
  assert.equal(await medicationRow.getByRole('combobox', {name: 'Κατάσταση νέας αγωγής', exact: true}).inputValue(), 'existing');
  await medicationRow.getByRole('combobox', {name: 'Φάρμακο', exact: true}).fill('QA SYNTHETIC existing medication');
  await medicationRow.getByRole('textbox', {name: 'Δόση', exact: true}).fill('50');
  await medicationRow.getByRole('textbox', {name: 'Συχνότητα', exact: true}).fill('QA once daily');
  await medicationRow.getByRole('button', {name: 'Αποθήκευση', exact: true}).click();
  await medicationRow.waitFor({state: 'detached'});
  const medications = await rows('demo_medications', patient.id);
  assert.equal(medications.length, 1);
  assert.equal(medications[0].record_source, 'existing');
  assert.equal(medications[0].started_at, null);
  assert.equal(medications[0].effective_from, null);
  assert.equal(medications[0].ended_at, null);
  const events = await rows('demo_medication_events', patient.id);
  assert.ok(events.every(event => event.session_id === null && event.event_type !== 'started'));
  const prior = {patient_id: patient.id, request_id: randomUUID(), expected_version: 0, period_label: '2018–2025', content: 'QA SYNTHETIC clinician-entered previous course, without recreated visits.'};
  await post('/api/patients/demo/prior-course', prior);
  assert.equal((await get('/api/patients/demo/prior-course?patient_id=' + patient.id)).priorCourse.content, prior.content);
  const when = new Date(Date.now() + 90 * 86400000); when.setUTCHours(size === 'desktop' ? 16 : 17, 0, 0, 0);
  const next = await post('/api/calendar/command/apply', {action: 'create', patient_id: patient.id, request_id: randomUUID(), start_iso: when.toISOString(), end_iso: new Date(+when + 3000000).toISOString(), appointment_type: 'follow_up', sms_reminder_enabled: false});
  assert.equal(next.event.session_id, null);
  assert.equal(next.event.patient_id, patient.id);
  assert.equal((await rows('demo_calendar_events', patient.id)).length, 1);
  await noEncounters();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({path: resolve(out, size + '-existing-treatment-real-supabase.png')});
  stamp('E/F: continued care', {existingMedication: true,unknownDatesPreserved: true,noPrescriptionOrEncounterCreated: true,priorCourse: true,calendarOnlyAppointment: true});
  return {size, status: 'passed', scope: 'Real Next.js clinical routes, cookie Auth, PostgREST, repository migrations and private Supabase Storage in a disposable local CI stack. Only extraction is a deterministic browser response backed by authenticated scan RPCs; external AI remains disabled.', externalAiGate: '503 verified', results, pdfEvidence};
}
