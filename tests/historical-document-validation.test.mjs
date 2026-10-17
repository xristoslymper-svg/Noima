import assert from 'node:assert/strict';
import test from 'node:test';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {validateDocumentBytes,safeDocumentName,documentMetadata} from '../lib/documents/validation.ts';
import {validateDocumentStructure} from '../lib/documents/structure-validation.ts';
import {normalizeHistoricalScan,questionnaireCalculation,validateScanReview,historyAdditionExists} from '../lib/documents/historical-scan.ts';
import {historySectionKeys} from '../lib/documents/types.ts';

const emptyExtracted=()=>({kind:'PHQ-9',patient_name:null,administration_date:null,reported_total:14,answers:null,
 history:Object.fromEntries(historySectionKeys.map(key=>[key,{text:'',attribution:'document',needs_review:false}])),uncertainties:[]});

test('PDF parser requires a real catalog and pages, not just a plausible header and EOF',async()=>{
 const minimal=Buffer.from('%PDF-1.7\n%%EOF');
 assert.equal(validateDocumentBytes(minimal,'application/pdf','historical.pdf'),'application/pdf');
 await assert.rejects(validateDocumentStructure(minimal,'application/pdf'),/document_malformed/);
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();
 assert.equal(validateDocumentBytes(bytes,'application/pdf','historical.pdf'),'application/pdf');
 assert.deepEqual(await validateDocumentStructure(bytes,'application/pdf'),{pages:1});
});

test('compressed PDF JavaScript actions are rejected after object-stream parsing',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();pdf.addJavaScript('synthetic-action','app.alert("synthetic fixture")');
 const bytes=await pdf.save({useObjectStreams:true});
 // The dangerous dictionary is compressed, so raw byte matching alone is insufficient.
 assert.equal(Buffer.from(bytes).includes(Buffer.from('/JavaScript')),false);
 assert.equal(validateDocumentBytes(bytes,'application/pdf','questionnaire.pdf'),'application/pdf');
 await assert.rejects(validateDocumentStructure(bytes,'application/pdf'),/document_active_content/);
});

test('actual JPEG/PNG/WebP pixels decode and a corrupt image with valid end markers fails',async()=>{
 const base=sharp({create:{width:8,height:8,channels:3,background:'#f7f6f2'}});
 for(const [format,mime,extension] of [['png','image/png','png'],['jpeg','image/jpeg','jpg'],['webp','image/webp','webp']]){
  const bytes=await base.clone()[format]().toBuffer();
  assert.equal(validateDocumentBytes(bytes,mime,'synthetic.'+extension),mime);
  assert.deepEqual(await validateDocumentStructure(bytes,mime),{pages:1});
 }
 const good=await base.png().toBuffer();const corrupt=Buffer.concat([good.subarray(0,33),Buffer.from('broken image data'),good.subarray(-12)]);
 assert.equal(validateDocumentBytes(corrupt,'image/png','synthetic.png'),'image/png');
 await assert.rejects(validateDocumentStructure(corrupt,'image/png'),/document_malformed/);
});

test('unsupported active formats, MIME mismatches, excessive bytes and malformed metadata fail closed',()=>{
 assert.throws(()=>validateDocumentBytes(Buffer.from('<svg><script>alert(1)</script></svg>'),'image/svg+xml','scan.svg'),/document_type/);
 assert.throws(()=>validateDocumentBytes(Buffer.from('%PDF-1.7\n/JavaScript 1 0 R\n%%EOF'),'application/pdf','scan.pdf'),/document_active_content/);
 assert.throws(()=>validateDocumentBytes(new Uint8Array(3*1024*1024+1),'application/pdf','large.pdf'),/document_too_large/);
 assert.throws(()=>documentMetadata({document_date:'2023-02-29'}),/document_metadata/);
 assert.equal(documentMetadata({document_date:'2024-02-29'}).document_date,'2024-02-29');
 assert.equal(safeDocumentName('../history\r\nfile.pdf'),'.._history__file.pdf');
});

test('total-only historical PHQ-9 does not produce answers, an item-nine answer or a fabricated date',()=>{
 const extracted=normalizeHistoricalScan(emptyExtracted(),'QA SYNTHETIC');
 assert.equal(extracted.answers,null);assert.equal(extracted.administration_date,null);
 assert.deepEqual(questionnaireCalculation(extracted.kind,extracted.answers,extracted.reported_total),{complete:false,computed:null,score:14,discrepancy:false});
 assert.throws(()=>validateScanReview({kind:'PHQ-9',administered_on:null,score:14,answers:null},extracted),/invalid_scan_review/);
 const review=validateScanReview({kind:'PHQ-9',administered_on:'2021-04-15',score:14,answers:null,note:''},extracted);
 assert.equal(review.answers,null);assert.equal(review.administered_on,'2021-04-15');
});

test('uncertain answers stay null; complete answers calculate total and expose a reported-score discrepancy',()=>{
 const raw={...emptyExtracted(),answers:[2,2,1,1,1,1,1,1,null],reported_total:12};
 const extracted=normalizeHistoricalScan(raw,'QA SYNTHETIC');
 assert.equal(extracted.answers[8],null);
 assert.equal(questionnaireCalculation('PHQ-9',extracted.answers,12).computed,null);
 const complete=[...extracted.answers];complete[8]=1;
 assert.deepEqual(questionnaireCalculation('PHQ-9',complete,12),{complete:true,computed:11,score:11,discrepancy:true});
 assert.throws(()=>validateScanReview({kind:'PHQ-9',administered_on:'2021-04-15',score:12,answers:complete},extracted),/invalid_scan_review/);
 assert.throws(()=>normalizeHistoricalScan({...raw,answers:[2,2,1,1,1,1,1,1,'1']},'QA SYNTHETIC'),/invalid_scan_result/);
});

test('name mismatch requires explicit linkage approval; punctuation, accents and word order do not manufacture mismatch',()=>{
 const extracted=normalizeHistoricalScan({...emptyExtracted(),patient_name:'Other synthetic patient'},'QA Synthetic');
 assert.equal(extracted.patient_identity_check,true);
 const review={kind:'PHQ-9',administered_on:'2021-04-15',score:14,answers:null};
 assert.throws(()=>validateScanReview(review,extracted),/invalid_scan_review/);
 assert.equal(validateScanReview({...review,patient_confirmed:true},extracted).patient_confirmed,true);
 assert.equal(normalizeHistoricalScan({...emptyExtracted(),patient_name:'Δοκιμή Παπαδόπουλος'},'Παπαδοπουλος Δοκιμη').patient_identity_check,false);
});

test('empty history stays empty instead of becoming negative findings; review cannot add a non-source section',()=>{
 const raw={...emptyExtracted(),kind:'history'};
 assert.deepEqual(normalizeHistoricalScan(raw,'QA SYNTHETIC').history,{});
 raw.history.hospitalizations={text:'Patient reports a fictional prior admission.',attribution:'patient_reported',needs_review:false};
 const extracted=normalizeHistoricalScan(raw,'QA SYNTHETIC');
 assert.deepEqual(Object.keys(extracted.history),['hospitalizations']);
 const review={kind:'history',expected_history_version:2,additions:[{field:'hospitalizations',text:'Reviewed fictional admission.',attribution:'patient_reported'}]};
 assert.equal(validateScanReview(review,extracted).additions[0].attribution,'patient_reported');
 assert.throws(()=>validateScanReview({...review,additions:[{field:'allergies',text:'No known allergy',attribution:'document'}]},extracted),/invalid_scan_review/);
});

test('history duplicate detection recognizes reviewed attributed paragraphs without conflating a longer different statement',()=>{
 const text='Synthetic historical admission.\nSecond line of the document.';
 assert.equal(historyAdditionExists(text,text),true);
 assert.equal(historyAdditionExists('Older confirmed text.\n\nΑναφορά ασθενούς σε έγγραφο: '+text,text),true);
 assert.equal(historyAdditionExists('Older confirmed text.\n\nΑπό έγγραφο: '+text+'\n\nAnother confirmed paragraph.',text),true);
 assert.equal(historyAdditionExists('Από έγγραφο: No known allergy.', 'No'),false);
});
