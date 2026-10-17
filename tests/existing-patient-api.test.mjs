import assert from 'node:assert/strict';
import {before, after, test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createExistingPatientApi} from './support/existing-patient-api.mjs';

let api, doctor, outsider;
before(async () => {
  api = await createExistingPatientApi();
  doctor = await api.db.clinician('QA Synthetic Existing-patient Doctor');
  outsider = await api.db.clinician('QA Synthetic Other Workspace');
});
after(async () => { await api?.close(); });
const readJson = async response => {
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
};
const count = async (table, patientId) => (await api.db.admin('select count(*)::int n from public.' + table + ' where patient_id=$1', [patientId]))[0].n;
const manual = (patientId, overrides = {}) => ({
  patient_id: patientId, request_id: randomUUID(), instrument: 'PHQ-9',
  score: 14, administered_on: '2022-06-15', ...overrides,
});

test('A: actual historical-score API persists three clinical dates without questionnaire answers or visits', async () => {
  const patient = await api.db.patient(doctor);
  const entered = [
    {score: 14, administered_on: '2022-06-15'},
    {score: 19, administered_on: '2020-02-10'},
    {score: 7, administered_on: '2023-09-12'},
  ];
  for (const measurement of entered) {
    const body = await readJson(await api.request(doctor, '/api/patients/demo/measurements', manual(patient.id, measurement)));
    assert.equal(body.measurement.answers, null);
    assert.equal(body.measurement.item9_review, false);
    assert.equal(body.measurement.item9_reviewed_at, null);
    assert.equal(body.measurement.session_id, null);
    assert.equal(body.measurement.appointment_id, null);
    assert.equal(body.measurement.entered_by, doctor.id);
    assert.equal(body.measurement.measurement_source, 'historical_manual');
    assert.equal(body.measurement.completed_at, measurement.administered_on);
    assert.ok(Date.parse(body.measurement.created_at) > Date.parse(measurement.administered_on));
  }
  const response = await api.request(doctor, '/api/patients/demo/measurements?patient_id=' + patient.id);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const {measurements} = await readJson(response);
  assert.deepEqual(measurements.map(row => [row.administered_on, row.score]), [
    ['2023-09-12', 7], ['2022-06-15', 14], ['2020-02-10', 19],
  ]);
  assert.equal(await count('demo_sessions', patient.id), 0);
  assert.equal(await count('demo_calendar_events', patient.id), 0);
  const questionnaires = await api.db.rpc(doctor.id, 'demo_assessment_list', {p_tester: doctor.workspace, p_patient: patient.id});
  assert.deepEqual(questionnaires, []);
});

test('A/G: actual API and PostgreSQL reject invalid totals, impossible dates and fabricated answer payloads', async () => {
  const patient = await api.db.patient(doctor);
  const invalid = [
    {score: -1}, {score: 28}, {score: 1.5}, {score: '14'}, {score: null},
    {instrument: 'GAD-7', score: 22}, {instrument: 'UNSUPPORTED'},
    {administered_on: '2022-02-30'}, {administered_on: '2099-01-01'}, {administered_on: '1899-12-31'},
    {answers: [1,1,1,1,1,1,1,1,1]}, {session_id: randomUUID()}, {appointment_id: randomUUID()},
  ];
  for (const value of invalid) assert.equal((await api.request(doctor, '/api/patients/demo/measurements', manual(patient.id, value))).status, 422, JSON.stringify(value));
  const rpcArgs = {p_tester: doctor.workspace, p_patient: patient.id, p_request: randomUUID(), p_instrument: 'PHQ-9', p_score: 28, p_administered_on: '2022-01-01'};
  await assert.rejects(api.db.rpc(doctor.id, 'demo_historical_measurement_save', rpcArgs), /invalid_historical_measurement/);
  await assert.rejects(api.db.rpc(doctor.id, 'demo_historical_measurement_save', {...rpcArgs, p_score: 9, p_answers: [1,1,1,1,1,1,1,1,1]}), /total_only_measurement/);
  await assert.rejects(api.db.rpc(doctor.id, 'demo_historical_measurement_save', {...rpcArgs, p_score: 9, p_source: 'historical_scan'}), /invalid_measurement_source/);
  await assert.rejects(api.db.query(doctor.id,
    "select private.demo_historical_measurement_save($1::uuid,$2::uuid,$3::uuid,'PHQ-9',9,'2022-01-01'::date)",
    [doctor.workspace, patient.id, randomUUID()]), /permission denied/, 'only the approved scan transaction may invoke the private saver');
  const {measurements} = await readJson(await api.request(doctor, '/api/patients/demo/measurements?patient_id=' + patient.id));
  assert.deepEqual(measurements, []);
  for (const value of [{instrument: 'PHQ-9', score: 0}, {instrument: 'PHQ-9', score: 27}, {instrument: 'GAD-7', score: 0}, {instrument: 'GAD-7', score: 21}]) {
    await readJson(await api.request(doctor, '/api/patients/demo/measurements', manual(patient.id, value)));
  }
});

test('A/G: retries remain idempotent and corrections append an audited replacement without mutating the original', async () => {
  const patient = await api.db.patient(doctor);
  const value = manual(patient.id, {note: 'QA source entry'});
  const first = await readJson(await api.request(doctor, '/api/patients/demo/measurements', value));
  const repeated = await readJson(await api.request(doctor, '/api/patients/demo/measurements', value));
  assert.equal(repeated.measurement.id, first.measurement.id);
  assert.equal((await api.request(doctor, '/api/patients/demo/measurements', {...value, score: 15})).status, 409);
  const correction = manual(patient.id, {score: 12, supersedes_id: value.request_id, reason: 'QA corrected source transcription'});
  const replacement = await readJson(await api.request(doctor, '/api/patients/demo/measurements', correction));
  assert.equal(replacement.measurement.supersedes_id, first.measurement.id);
  const {measurements} = await readJson(await api.request(doctor, '/api/patients/demo/measurements?patient_id=' + patient.id));
  assert.deepEqual(measurements.map(row => row.id), [replacement.measurement.id]);
  const audit = await api.db.admin('select score,actor_id,correction_reason,supersedes_id from private.demo_historical_measurements where patient_id=$1 order by created_at', [patient.id]);
  assert.equal(audit.length, 2);
  assert.equal(audit[0].score, 14);
  assert.equal(audit[1].actor_id, doctor.id);
  assert.equal(audit[1].correction_reason, correction.reason);
  assert.equal((await api.request(doctor, '/api/patients/demo/measurements', {...correction, request_id: randomUUID()})).status, 409);
  await assert.rejects(api.db.admin('update private.demo_historical_measurements set score=0 where id=$1', [first.measurement.id]), /historical_measurement_immutable/);
});

test('G: actual withPilot guard ignores forged workspace IDs and denies anonymous, cross-origin and cross-patient operations', async () => {
  const patient = await api.db.patient(doctor);
  const other = await api.db.patient(outsider);
  const written = await readJson(await api.request(doctor, '/api/patients/demo/measurements', manual(patient.id, {tester: outsider.workspace, source: 'historical_scan'})));
  assert.equal(written.measurement.tester_id, doctor.workspace);
  assert.equal(written.measurement.measurement_source, 'historical_manual');
  assert.equal((await api.request(doctor, '/api/patients/demo/measurements', manual(other.id, {tester: outsider.workspace}))).status, 404);
  assert.equal((await api.request(outsider, '/api/patients/demo/measurements?patient_id=' + patient.id)).status, 404);
  assert.equal((await api.request(null, '/api/patients/demo/measurements?patient_id=' + patient.id)).status, 401);
  assert.equal((await api.request(null, '/api/patients/demo/measurements', manual(patient.id, {tester: doctor.workspace}))).status, 401);
  assert.equal((await api.request(doctor, '/api/patients/demo/measurements', manual(patient.id), {headers: {origin: 'https://untrusted.invalid'}})).status, 403);
  await assert.rejects(api.db.rpc(outsider.id, 'demo_historical_measurement_list', {p_tester: doctor.workspace, p_patient: patient.id}), /pilot_not_authorized/);
  await assert.rejects(api.db.rpc(null, 'demo_historical_measurement_list', {p_tester: doctor.workspace, p_patient: patient.id}), /permission denied/);
  await assert.rejects(api.db.query(doctor.id, 'select * from private.demo_historical_measurements'), /permission denied/);
});

test('F: existing patient creation, previous clinical course and next appointment do not create an initial assessment', async () => {
  const {patient} = await readJson(await api.request(doctor, '/api/patients/demo/runtime', {action: 'create_patient', first_name: 'QA SYNTHETIC transfer', last_name: 'History preserved'}));
  assert.equal(await count('demo_sessions', patient.id), 0);
  const prior = {
    patient_id: patient.id, request_id: randomUUID(), expected_version: 0,
    period_label: '2018–2025', content: 'QA SYNTHETIC: Previous course recorded by the treating clinician. No historical appointments recreated.',
  };
  await readJson(await api.request(doctor, '/api/patients/demo/prior-course', prior));
  const loaded = await readJson(await api.request(doctor, '/api/patients/demo/prior-course?patient_id=' + patient.id));
  assert.equal(loaded.priorCourse.content, prior.content);
  const {event} = await readJson(await api.request(doctor, '/api/calendar/command/apply', {
    action: 'create', patient_id: patient.id, request_id: randomUUID(),
    start_iso: '2099-10-17T08:00:00Z', end_iso: '2099-10-17T08:50:00Z',
    appointment_type: 'follow_up', sms_reminder_enabled: false,
  }));
  assert.equal(event.patient_id, patient.id);
  assert.equal(event.session_id, null);
  assert.equal(event.appointment_type, 'follow_up');
  assert.equal(await count('demo_sessions', patient.id), 0);
  assert.equal(await count('demo_calendar_events', patient.id), 1);
});

test('E: actual medication API registers ongoing and discontinued treatment with unknown dates without a visit or new prescription', async () => {
  const patient = await api.db.patient(doctor);
  const value = {
    action: 'medication_register', patient_id: patient.id, request_id: randomUUID(),
    mode: 'existing', name: 'QA SYNTHETIC medication', dose: 50, unit: 'mg',
    frequency: 'QA once daily', started_on: null, stopped_on: null, session_id: null,
  };
  const {medication} = await readJson(await api.request(doctor, '/api/patients/demo/runtime', value));
  assert.equal(medication.patient_id, patient.id);
  assert.equal(medication.record_source, 'existing');
  assert.equal(medication.registration_request_id, value.request_id);
  assert.equal(medication.recorded_by, doctor.id);
  assert.equal(medication.started_at, null);
  assert.equal(medication.effective_from, null);
  const again = await readJson(await api.request(doctor, '/api/patients/demo/runtime', value));
  assert.equal(again.medication.id, medication.id);
  assert.equal((await api.request(doctor, '/api/patients/demo/runtime', {...value, dose: 75})).status, 409);
  const past = await readJson(await api.request(doctor, '/api/patients/demo/runtime', {...value, request_id: randomUUID(), mode: 'historical', name: 'QA SYNTHETIC prior medication'}));
  assert.equal(past.medication.record_source, 'historical');
  assert.equal(past.medication.started_at, null);
  assert.equal(past.medication.ended_at, null);
  assert.equal(await count('demo_sessions', patient.id), 0);
  assert.equal(await count('demo_calendar_events', patient.id), 0);
  const events = await api.db.read(doctor.id, 'demo_medication_events?patient_id=eq.' + patient.id);
  assert.ok(events.every(event => event.session_id === null));
  assert.ok(!events.some(event => event.event_type === 'started'));
});
