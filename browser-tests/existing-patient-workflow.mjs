import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createExistingPatientServer} from './existing-patient-server.mjs';
import {syntheticDischarge, syntheticPhqPng, syntheticHistory} from '../tests/support/synthetic-existing-documents.mjs';

// Actual production React -> actual API -> exact migrated isolated PostgreSQL.
// Authentication, object transport and OCR responses are synthetic adapters;
// no hosted service or patient data is contacted by this suite.
const require = createRequire(import.meta.url);
const runtime = process.env.NOIMA_TEST_PLAYWRIGHT_PATH || (existsSync('/tmp/noima-browser-tools/node_modules/playwright') ? '/tmp/noima-browser-tools/node_modules/playwright' : 'playwright');
const {chromium} = require(runtime);
const out = resolve(process.env.NOIMA_TEST_OUTPUT || '/tmp/noima-existing-patient-browser-audit');
mkdirSync(out, {recursive: true});
const launch = {headless: true};
if (process.env.NOIMA_TEST_CHROMIUM_EXECUTABLE) launch.executablePath = process.env.NOIMA_TEST_CHROMIUM_EXECUTABLE;
else if (existsSync('/tmp/noima-browser-tools/node_modules/@sparticuz/chromium')) {
  const packed = require('/tmp/noima-browser-tools/node_modules/@sparticuz/chromium');
  // Lambda's single-process mode cannot safely close/reopen browser contexts.
  // Preserve web security while using its redistributable executable locally.
  launch.args = packed.args.filter(value => !['--single-process','--disable-web-security','--allow-running-insecure-content','--disable-site-isolation-trials'].includes(value));
  launch.executablePath = await packed.executablePath();
}
const fixture = await createExistingPatientServer(out);
const browser = await chromium.launch(launch);
const report = {scope: 'Production React and API handlers, exact isolated PostgreSQL migrations; synthetic Auth, REST/Storage transport and deterministic OCR provider', viewports: [], workflows: []};
const phqImage = await syntheticPhqPng();
const historyFields = ['psychiatric_history','medical_history','previous_treatments','hospitalizations','family_history','substance_history','social_functioning','allergies'];
const extraction = overrides => ({kind: 'PHQ-9', patient_name: 'QA SYNTHETIC existing patient', administration_date: '2021-06-15', reported_total: 12, answers: [2,2,1,1,1,1,1,1,null], history: Object.fromEntries(historyFields.map(field => [field, {text: '', attribution: 'document', needs_review: false}])), uncertainties: [{field: 'answers.8', issue: 'QA unclear source mark'}], ...overrides});
const okJson = async response => {const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body;};
const dbCount = async (table, patientId) => (await fixture.api.db.admin('select count(*)::int n from public.' + table + ' where patient_id=$1', [patientId]))[0].n;
let currentPage;
try {
  for (const viewport of [{name: 'desktop', width: 1440, height: 1000}, {name: 'mobile', width: 390, height: 844}]) {
    const context = await browser.newContext({baseURL: fixture.origin, viewport: {width: viewport.width, height: viewport.height}, locale: 'el-GR', timezoneId: 'Europe/Athens'});
    const page = currentPage = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const patient = await fixture.api.db.patient(fixture.doctor);
    const base = fixture.origin + '/patients/demo/' + patient.id;
    const tabs = page.getByRole('navigation', {name: 'Καρτέλες φακέλου'});
    const shots = [];
    const snapshot = async name => {
      const path = resolve(out, viewport.name + '-' + name + '.png');
      const modalOpen = await page.getByRole('dialog').count() > 0;
      if (!modalOpen) await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({path, fullPage: !modalOpen});
      shots.push(path);
    };
    const noOverflow = async name => {
      const result = await page.evaluate(() => ({width: innerWidth, document: document.documentElement.scrollWidth, wide: Array.from(document.querySelectorAll('[role="dialog"], .medication-table-editor')).filter(element => element.getBoundingClientRect().height > 0).map(element => ({element: element.className, width: element.clientWidth, scroll: element.scrollWidth}))}));
      assert.ok(result.document <= result.width + 1, name + ' page overflow: ' + JSON.stringify(result));
      for (const element of result.wide) assert.ok(element.scroll <= element.width + 1, name + ' workflow overflow: ' + JSON.stringify(element));
    };
    const openHistoryAction = async name => {
      await tabs.getByRole('button', {name: 'Ιστορικό', exact: true}).click();
      const heading = page.locator('summary').filter({hasText: /^Προσθήκη$/});
      await heading.click();
      const menu = page.locator('details').filter({has: heading});
      assert.deepEqual(await menu.locator('button').allTextContents(), ['Βαθμολογία', 'Σάρωση εντύπου', 'Έγγραφο']);
      await page.getByRole('button', {name, exact: true}).click();
      await page.getByRole('dialog').waitFor();
    };
    const chooseFile = async (dialog, file) => {
      const [picked] = await Promise.all([
        page.waitForEvent('filechooser'),
        dialog.locator('button').filter({hasText: /^Επιλογή ή απόθεση αρχείου$/}).click(),
      ]);
      await picked.setFiles(file);
    };
    const downloadOriginal = async (link, bytes, name) => {
      const href = new URL(await link.getAttribute('href'), fixture.origin).href;
      assert.equal(new URL(href).searchParams.get('download'), '1');
      assert.notEqual(await link.getAttribute('download'), null);
      assert.equal(await link.getAttribute('target'), null);
      const response = await page.request.get(href);
      assert.equal(response.status(), 200);
      assert.deepEqual(await response.body(), bytes);
      assert.equal(response.headers()['cache-control'], 'private, no-store');
      assert.match(response.headers()['content-disposition'], /^attachment;/);
      const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
      const path = resolve(out, viewport.name + '-' + name);
      await download.saveAs(path);
      assert.equal(await download.failure(), null);
      assert.deepEqual(readFileSync(path), bytes, 'browser download preserves the exact protected original');
    };

    await page.goto(base + '?tab=timeline');
    const measurements = page.locator('#patient-measurements');
    await measurements.getByRole('heading', {name: 'Μετρήσεις'}).waitFor();
    for (const label of ['Σύνοψη', 'Πορεία', 'Θεραπεία', 'Ιστορικό']) assert.equal(await tabs.getByRole('button', {name: label, exact: true}).count(), 1, 'four established tab labels');
    const addScore = measurements.getByRole('button', {name: 'Βαθμολογία', exact: true});
    const scoreForm = measurements.getByRole('form', {name: 'Βαθμολογία', exact: true});
    await addScore.click();
    await page.waitForFunction(node => node === document.activeElement, await scoreForm.getByLabel('Εργαλείο').elementHandle());
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await scoreForm.locator('input:visible,select:visible,textarea:visible').count(), 3);
    assert.equal(await scoreForm.getByLabel('Εργαλείο').inputValue(), 'PHQ-9');
    assert.equal(await scoreForm.getByLabel('Ημερομηνία εξέτασης').inputValue(), '');
    await scoreForm.getByLabel('Βαθμολογία', {exact: true}).fill('14');
    await scoreForm.getByLabel('Ημερομηνία εξέτασης').fill('2022-06-15');
    await page.keyboard.press('Escape');
    assert.equal(await scoreForm.count(), 0);
    assert.equal(await addScore.evaluate(node => node === document.activeElement), true, 'ESC returns focus to opener');
    await addScore.click();
    await page.waitForFunction(node => node.value === '14', await scoreForm.getByLabel('Βαθμολογία', {exact: true}).elementHandle());
    assert.equal(await scoreForm.getByLabel('Βαθμολογία', {exact: true}).inputValue(), '14', 'draft score restored');
    assert.equal(await scoreForm.getByLabel('Ημερομηνία εξέτασης').inputValue(), '2022-06-15', 'draft date restored');
    await noOverflow('manual score');
    await snapshot('manual-score');
    const values = [{score: '14', date: '2022-06-15'}, {score: '19', date: '2020-02-10'}, {score: '7', date: '2023-09-12'}];
    for (const [index, value] of values.entries()) {
      if (index) await addScore.click();
      await scoreForm.getByLabel('Βαθμολογία', {exact: true}).fill(value.score);
      await scoreForm.getByLabel('Ημερομηνία εξέτασης').fill(value.date);
      await scoreForm.getByRole('button', {name: 'Αποθήκευση', exact: true}).click();
      await scoreForm.waitFor({state: 'detached'});
    }
    const scores = (await okJson(await fixture.api.request(fixture.doctor, '/api/patients/demo/measurements?patient_id=' + patient.id))).measurements;
    assert.deepEqual(scores.map(item => [item.administered_on, item.score]), [['2023-09-12',7],['2022-06-15',14],['2020-02-10',19]]);
    assert.ok(scores.every(item => item.answers === null && !item.item9_review && item.session_id === null));
    const chart = measurements.getByRole('img', {name: /^PHQ-9/});
    const chartLabel = await chart.getAttribute('aria-label');
    assert.match(chartLabel, /2020.*19.*2022.*14.*2023.*7/);
    assert.equal(await chart.locator('circle').count(), 3);
    await snapshot('three-historical-scores');
    await page.goto(base + '?tab=psychometrics&assessment=' + scores[1].id);
    const targeted = page.locator('[data-assessment-id="' + scores[1].id + '"]');
    await targeted.waitFor();
    assert.equal(await page.locator('#patient-measurements').count(), 1);
    assert.equal(await page.locator('#patient-measurements > details[open]').count(), 1);
    assert.equal(await targeted.locator('details').count(), 0, 'manual totals do not acquire an answer form');
    assert.equal(await targeted.evaluate(node => node === document.activeElement), true, 'deep link focuses the selected result');
    assert.match(await targeted.innerText(), /Αναδρομική καταχώριση/);
    assert.doesNotMatch(await targeted.innerText(), /Ερώτηση 9|Επανέλεγχος κινδύνου/);
    assert.equal(await dbCount('demo_sessions', patient.id), 0);

    await openHistoryAction('Έγγραφο');
    let dialog = page.getByRole('dialog');
    assert.equal(await dialog.locator('input:not([type=file]):visible,select:visible,textarea:visible').count(), 0, 'metadata progressively disclosed');
    await chooseFile(dialog, {name: 'QA-synthetic-discharge.pdf', mimeType: 'application/pdf', buffer: syntheticDischarge()});
    await snapshot('document-upload');
    await noOverflow('document upload');
    await dialog.getByRole('button', {name: 'Αποθήκευση', exact: true}).click();
    await dialog.waitFor({state: 'detached'});
    const originalLink = page.getByRole('link', {name: 'QA-synthetic-discharge.pdf', exact: true});
    await originalLink.waitFor();
    await downloadOriginal(originalLink, syntheticDischarge(), 'protected-discharge-download.pdf');
    // Failure recovery is part of the same attachment interaction, without a
    // confirmation dialog or a second choice of upload mode.
    await openHistoryAction('Έγγραφο');
    dialog = page.getByRole('dialog');
    await chooseFile(dialog, {name: 'QA-recoverable-upload.pdf', mimeType: 'application/pdf', buffer: syntheticDischarge()});
    fixture.api.faults.upload = 1;
    await dialog.getByRole('button', {name: 'Αποθήκευση', exact: true}).click();
    await dialog.getByRole('alert').waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({state: 'detached'});
    await openHistoryAction('Έγγραφο');
    dialog = page.getByRole('dialog');
    assert.match(await dialog.innerText(), /QA-recoverable-upload\.pdf/);
    await dialog.getByRole('button', {name: 'Αποθήκευση', exact: true}).click();
    await dialog.waitFor({state: 'detached'});
    assert.equal(await page.getByRole('link', {name: 'QA-recoverable-upload.pdf', exact: true}).count(), 1);

    fixture.api.setProviderResult(extraction());
    await openHistoryAction('Σάρωση εντύπου');
    dialog = page.getByRole('dialog');
    await chooseFile(dialog, {name: 'QA-old-PHQ9-no-code.png', mimeType: 'image/png', buffer: phqImage});
    await dialog.getByRole('heading', {name: 'PHQ-9', exact: true}).waitFor();
    assert.equal(await dialog.locator('select:visible').count(), 1, 'only uncertain answer exposed');
    const uncertain = dialog.getByRole('combobox', {name: 'Απάντηση 9', exact: true});
    assert.equal(await uncertain.inputValue(), '');
    await uncertain.selectOption('1');
    assert.equal(await dialog.getByLabel('Βαθμολογία', {exact: true}).inputValue(), '11');
    assert.match(await dialog.innerText(), /12.*11/);
    await noOverflow('scan review');
    const source = dialog.getByRole('img', {name: 'Πρωτότυπο', exact: true});
    await source.waitFor();
    await page.waitForFunction(node => node.complete && node.naturalWidth > 0, await source.elementHandle());
    const sourceResponse = await page.request.get(await source.getAttribute('src'));
    assert.equal(sourceResponse.status(), 200);
    assert.deepEqual(await sourceResponse.body(), phqImage);
    await snapshot('scan-review');
    report.workflows.push({viewport: viewport.name, workflow: 'Original questionnaire image', response: 200, originalBytesMatch: true, rendered: await source.evaluate(node => ({width: node.naturalWidth, height: node.naturalHeight}))});
    await dialog.getByRole('button', {name: 'Έγκριση και αποθήκευση', exact: true}).click();
    await dialog.waitFor({state: 'detached'});
    const scanned = (await okJson(await fixture.api.request(fixture.doctor, '/api/patients/demo/measurements?patient_id=' + patient.id))).measurements.find(item => item.measurement_source === 'historical_scan');
    assert.equal(scanned.score, 11);
    assert.equal(scanned.answers[8], 1);
    assert.equal(scanned.document_ids.length, 1);
    assert.equal(await dbCount('demo_risk_assessments', patient.id), 0);
    await page.goto(base + '?tab=treatment&section=measurements&assessment=' + scanned.id);
    const reviewedResult = page.locator('[data-assessment-id="' + scanned.id + '"]');
    await reviewedResult.waitFor();
    assert.equal(await reviewedResult.locator('details[open]').count(), 1, 'legacy targeted scanned result opens its real answers');
    assert.equal(await reviewedResult.locator('.review-signal').count(), 0, 'historical item9 is not a current risk alert');
    await downloadOriginal(reviewedResult.getByRole('link', {name: 'Λήψη πρωτοτύπου', exact: true}), phqImage, 'protected-measurement-original.png');

    let history = (await fixture.api.db.read(fixture.doctor.id, 'demo_patient_history?patient_id=eq.' + patient.id))[0];
    await okJson(await fixture.api.request(fixture.doctor, '/api/patients/demo/runtime', {action: 'save_history', patient_id: patient.id, history: {...history, allergies: 'QA SYNTHETIC known allergy retained'}, expected_version: history.version}));
    await page.reload();
    await tabs.getByRole('button', {name: 'Ιστορικό', exact: true}).waitFor();
    const sourceHistory = extraction({kind: 'history', administration_date: null, reported_total: null, answers: null, uncertainties: []});
    sourceHistory.history.allergies = {text: 'QA SYNTHETIC different allergy in source', attribution: 'document', needs_review: true};
    sourceHistory.history.hospitalizations = {text: 'QA SYNTHETIC reported admission in 2018', attribution: 'patient_reported', needs_review: false};
    fixture.api.setProviderResult(sourceHistory);
    await openHistoryAction('Σάρωση εντύπου');
    dialog = page.getByRole('dialog');
    await chooseFile(dialog, {name: 'QA-old-history.pdf', mimeType: 'application/pdf', buffer: syntheticHistory()});
    await dialog.getByRole('heading', {name: 'Παλιό ιστορικό', exact: true}).waitFor();
    assert.equal(await dialog.getByRole('checkbox').count(), 2);
    assert.equal(await dialog.getByRole('checkbox', {name: /Αλλεργίες/}).isChecked(), false);
    assert.equal(await dialog.getByRole('checkbox', {name: /Νοσηλείες/}).isChecked(), true);
    assert.equal(await dialog.locator('textarea:visible').count(), 0, 'details remain compact');
    const nativePdf = await page.evaluate(() => navigator.pdfViewerEnabled);
    assert.equal(await dialog.locator('iframe').count(), 0, 'protected PDFs have no unsupported native preview pane');
    assert.equal(await dialog.getByRole('link', {name: 'Άνοιγμα', exact: true}).count(), 0);
    const compactWidth = await dialog.evaluate(node => node.getBoundingClientRect().width);
    assert.ok(compactWidth <= 471, 'PDF review remains a compact single column');
    await downloadOriginal(dialog.getByRole('link', {name: 'Λήψη: QA-old-history.pdf', exact: true}), syntheticHistory(), 'protected-history-download.pdf');
    report.workflows.push({viewport: viewport.name, workflow: 'Original history PDF', response: 200, originalBytesMatch: true, nativeViewerAvailable: nativePdf, nativeRendererUsed: false, protectedDownloadVerified: true, downloadedBytesMatch: true, compactWidth});
    await noOverflow('history review');
    await snapshot('history-conflict-review');
    await dialog.getByRole('button', {name: 'Έγκριση και αποθήκευση', exact: true}).click();
    await dialog.waitFor({state: 'detached'});
    history = (await fixture.api.db.read(fixture.doctor.id, 'demo_patient_history?patient_id=eq.' + patient.id))[0];
    assert.equal(history.allergies, 'QA SYNTHETIC known allergy retained');
    assert.equal(history.hospitalizations, 'Αναφορά ασθενούς σε έγγραφο: ' + sourceHistory.history.hospitalizations.text);

    await tabs.getByRole('button', {name: 'Θεραπεία', exact: true}).click();
    await page.getByRole('button', {name: 'Αγωγή', exact: true}).click();
    const medRow = page.locator('.med-new-row');
    await medRow.waitFor();
    const medTable = page.locator('.medication-lean-table');
    const medSemantics = await medTable.ariaSnapshot();
    assert.match(medSemantics, /table/);
    assert.equal(await medTable.getByRole('columnheader').count(), 7, 'responsive table retains its semantic headers');
    assert.ok(await medTable.getByRole('row').count() >= 2, 'responsive table retains row semantics');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await medRow.getByRole('combobox', {name: 'Κατάσταση νέας αγωγής', exact: true}).inputValue(), 'existing');
    assert.equal(await medRow.locator('input[type=date]:visible').count(), 0);
    await medRow.getByRole('combobox', {name: 'Φάρμακο', exact: true}).fill('QA SYNTHETIC existing medication');
    await medRow.getByRole('textbox', {name: 'Δόση', exact: true}).fill('50');
    await medRow.getByRole('textbox', {name: 'Συχνότητα', exact: true}).fill('QA once daily');
    const medicationControls = await medRow.locator('input:visible,select:visible').evaluateAll(nodes => nodes.map(node => {
      const bounds = node.getBoundingClientRect(), cell = node.closest('td,th').getBoundingClientRect();
      return {name: node.getAttribute('aria-label'), width: bounds.width, left: bounds.left, right: bounds.right, cellLeft: cell.left, cellRight: cell.right};
    }));
    assert.ok(medicationControls.find(control => control.name === 'Δόση').width >= (viewport.name === 'mobile' ? 80 : 40), 'dose value remains readable');
    for (const control of medicationControls) assert.ok(control.left >= control.cellLeft - 1 && control.right <= control.cellRight + 1, 'medication control remains inside its own cell: ' + JSON.stringify(control));
    await snapshot('existing-medication');
    await noOverflow('existing medication');
    const registrationIds = [];
    let loseMedicationResponse = true;
    await page.route('**/api/patients/demo/runtime', async route => {
      const request = route.request();
      if (request.method() !== 'POST' || request.postDataJSON()?.action !== 'medication_register') return route.continue();
      registrationIds.push(request.postDataJSON().request_id);
      if (!loseMedicationResponse) return route.continue();
      loseMedicationResponse = false;
      const response = await route.fetch();
      assert.equal(response.status(), 200, 'first medication request really commits before transport fails');
      await route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'QA response delivery failed'})});
    });
    await medRow.getByRole('button', {name: 'Αποθήκευση', exact: true}).click();
    await medRow.getByRole('alert').waitFor();
    assert.equal(await medRow.getByRole('combobox', {name: 'Φάρμακο', exact: true}).inputValue(), 'QA SYNTHETIC existing medication');
    assert.equal(await medRow.getByRole('textbox', {name: 'Δόση', exact: true}).inputValue(), '50');
    assert.equal(await medRow.getByRole('textbox', {name: 'Συχνότητα', exact: true}).inputValue(), 'QA once daily');
    await medRow.getByRole('button', {name: 'Αποθήκευση', exact: true}).evaluate(button => {button.click(); button.click();});
    await medRow.waitFor({state: 'detached'});
    assert.equal(registrationIds.length, 2, 'one initial request and one retry; double click does not duplicate');
    assert.equal(new Set(registrationIds).size, 1, 'retry retains stable request identity');
    await page.unroute('**/api/patients/demo/runtime');
    const medication = (await fixture.api.db.read(fixture.doctor.id, 'demo_medications?patient_id=eq.' + patient.id))[0];
    assert.equal(medication.record_source, 'existing');
    assert.equal(medication.started_at, null);
    assert.equal(medication.ended_at, null);
    assert.equal(medication.effective_from, null);
    assert.equal(await dbCount('demo_sessions', patient.id), 0);
    assert.equal(await dbCount('demo_calendar_events', patient.id), 0);
    assert.equal(await dbCount('demo_medications', patient.id), 1);
    assert.deepEqual(pageErrors, [], 'no uncaught React errors');
    await snapshot('existing-medication-saved');
    report.viewports.push({...viewport, patient: patient.id, screenshots: shots, status: 'passed'});
    console.log(viewport.name + ': scores, ESC recovery, original documents, upload recovery, scan correction, conflicting history, existing medication passed');
    await context.close();
  }
  report.cognitiveLoad = [
    {workflow: 'Historical score', actionClicks: 2, requiredFields: 3, prefilledFields: ['Instrument: PHQ-9'], decisionCount: 1, decisions: 'Instrument choice, with PHQ-9 preselected; score and examination date are clinical values', dialogs: 0, screenTransitions: 0},
    {workflow: 'Document', actionClicks: 4, requiredFields: 1, prefilledFields: ['Patient'], decisionCount: 1, decisions: 'Document action in the contextual menu; the source file is the required input', dialogs: 1, screenTransitions: 0},
    {workflow: 'Questionnaire scan', actionClicks: 4, requiredFields: 1, prefilledFields: ['Patient', 'Recognized instrument', 'Legible answers/date'], decisionCount: 3, decisions: 'Scan action, one uncertain-answer correction in the tested source, final approval (2 choices for a fully legible source)', dialogs: 1, screenTransitions: 0},
    {workflow: 'History import', actionClicks: 4, requiredFields: 1, prefilledFields: ['Patient', 'Uncontested new additions'], decisionCount: 4, decisions: 'Scan action, accept the new hospitalization, retain the existing allergy, final approval; decisions scale only with relevant differences', dialogs: 1, screenTransitions: 0},
    {workflow: 'Existing medication', actionClicks: 2, requiredFields: 3, prefilledFields: ['Patient', 'Already taking', 'mg'], decisionCount: 1, decisions: 'Clinical registration status, with Already taking preselected; medication, dose and frequency are required values', dialogs: 0, screenTransitions: 0},
  ];
  report.counting = 'From the relevant tab already open. Action clicks count menu opening, action choice, native file-picker opening and Save/Approve; typing, field focus, native file selection and correction controls are separate. Decision counts include workflow selections and clinical approval judgments in the tested scenario, including preselected instrument/status choices; typing known clinical values is counted under fields. Source upload/review states stay within one dialog.';
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log('PASS: synthetic existing-patient desktop and mobile workflows; evidence: ' + resolve(out, 'report.json'));
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({path: resolve(out, 'failure.png'), fullPage: true}).catch(() => {});
    writeFileSync(resolve(out, 'failure.txt'), await currentPage.locator('body').innerText().catch(() => 'no page text'));
  }
  report.error = error.stack;
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
  await fixture.close();
}
