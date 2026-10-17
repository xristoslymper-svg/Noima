// Deliberately fictional source documents generated entirely inside each test.
// ASCII text keeps fixture bytes stable across operating systems and runtimes.
export function syntheticPdf(lines) {
  const escape = text => text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const stream = 'BT /F1 14 Tf 48 760 Td ' + lines.map((line, index) => (index ? '0 -24 Td ' : '') + '(' + escape(line) + ') Tj').join('\n') + '\nET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let text = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(text)); text += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
  const xref = Buffer.byteLength(text);
  text += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  text += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(text);
}

export const syntheticDischarge = () => syntheticPdf([
  'QA SYNTHETIC DISCHARGE SUMMARY', 'No real patient or clinical information.',
  'Patient: QA SYNTHETIC existing patient', 'Document date: 2020-04-10',
  'Fictional hospitalization; review before clinical use.',
]);

export const syntheticPhq = () => syntheticPdf([
  'QA SYNTHETIC PHQ-9 - HISTORICAL PAPER', 'No NOIMA assignment code. No real patient data.',
  'Patient: QA SYNTHETIC existing patient', 'Administration date: 2021-06-15',
  'Item 1: 2', 'Item 2: 2', 'Item 3: 1', 'Item 4: 1', 'Item 5: 1',
  'Item 6: 1', 'Item 7: 1', 'Item 8: 1', 'Item 9: [unclear mark]',
  'Reported total: 12',
]);

export async function syntheticPhqPng() {
  const {default: sharp} = await import('sharp');
  const lines = [
    'QA SYNTHETIC PHQ-9', 'No NOIMA code. No real patient data.',
    'Patient: QA SYNTHETIC existing patient', 'Administration date: 2021-06-15',
    'Item 1: 2', 'Item 2: 2', 'Item 3: 1', 'Item 4: 1', 'Item 5: 1',
    'Item 6: 1', 'Item 7: 1', 'Item 8: 1', 'Item 9: [unclear mark]', 'Reported total: 12',
  ];
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1000"><rect width="900" height="1000" fill="white"/>' + lines.map((text, index) => '<text x="44" y="' + (55 + index * 62) + '" font-family="sans-serif" font-size="' + (index < 4 ? 27 : 30) + '" fill="#162f26">' + text + '</text>').join('') + '</svg>';
  return sharp(Buffer.from(source)).png().toBuffer();
}

export const syntheticHistory = () => syntheticPdf([
  'QA SYNTHETIC HISTORICAL PSYCHIATRIC FORM', 'No real patient or clinical information.',
  'Patient: QA SYNTHETIC existing patient',
  'Patient reports a prior fictional admission in 2018.',
  'Document lists a different allergy from the existing record.',
  'Imported information must be reviewed before confirmation.',
]);

export function documentForm(patientId, id, bytes = syntheticDischarge(), options = {}) {
  const form = new FormData();
  form.set('patient_id', patientId);
  form.set('request_id', id);
  form.set('file', new File([bytes], options.name || 'synthetic-discharge.pdf', {type: options.type || 'application/pdf'}));
  for (const key of ['title', 'category', 'document_date']) if (options[key] !== undefined) form.set(key, options[key]);
  return form;
}
