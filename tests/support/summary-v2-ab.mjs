// A/B comparison using fictional chart fixtures only; never reads or writes a patient database.
// One attempt per arm and patient (3 x 2), no retries, no LLM judge, no summary verification calls.
// The output is a research sample, NOT an approved clinical summary.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {makePatients,truth} from './longitudinal-fixtures.mjs';
import {buildSummaryContext} from '../../lib/clinical/summary-context.ts';
import {providerEvidence} from '../../lib/clinical/provider-evidence.ts';
const branch='audit/summary-v2-ab-20261016';
const report={experiment:'NOIMA clinical summary A/B',created_at:new Date().toISOString(),model:process.env.OPENAI_CLINICAL_MODEL||'gpt-6-luna',git_sha:process.env.VERCEL_GIT_COMMIT_SHA||null,patient_ids:['A','B','C'],visits_per_patient:12,provider_calls_attempted:0,limit:6,baseline:'Exact CLINICAL_WRITING_PROMPT from production source',variant:'Three-section Greek minimal V2',summary_verification_calls:0,results:[],ground_truth:truth,status:'not_run',note:'Compares model generations only, not production delivery/caching/grounding verifier.'};
const v2=`Είσαι ο κλινικός βοηθός του NOIMA. Ετοίμασε μια ουσιαστική κλινική εικόνα για τον θεράποντα ψυχίατρο, βασισμένη ΑΠΟΚΛΕΙΣΤΙΚΑ στο ιστορικό του συγκεκριμένου ασθενή που σου δίνεται.
Δεν σου ζητείται περίληψη κάθε επίσκεψης. Μελέτησε τις ολοκληρωμένες καταγραφές ως ενιαία κλινική ιστορία. Επίλεξε τα λίγα γεγονότα που εξηγούν καλύτερα τη σημερινή κατάσταση και τη διαχρονική εξέλιξη, αναδεικνύοντας ενδιάμεσες μεταβολές και σημεία καμπής αντί να παραθέτεις διαδοχικές συνεδρίες. Μια παλαιότερη σημαντική πληροφορία δεν παύει να είναι σημαντική επειδή δεν αναφέρθηκε ξανά.
Παρουσίασε με σύντομες, φυσικές, επαγγελματικές ελληνικές διατυπώσεις μόνο όσα έχουν ουσία, οργανώνοντάς τα σε έως τρεις νοηματικές ενότητες: Τρέχουσα κατάσταση (theme general), Συνολική πορεία (theme course ή psychometrics), Σημαντικά σημεία (theme context ή risk ή medication). Μην γεμίζεις τεχνητά ενότητες. Προτίμησε συνοχή και ερμηνεία τεκμηριωμένων τάσεων, όχι χρονολογική απαρίθμηση.
Μην επινοείς γεγονότα, διαγνώσεις, αιτιώδεις σχέσεις, υποδείξεις θεραπείας ή αξιολογήσεις κινδύνου. Διατήρησε ημερομηνίες όταν χρειάζονται, αρνήσεις, αποδιδόμενες δηλώσεις, αβεβαιότητες και μεταγενέστερες διορθώσεις. Η έλλειψη πληροφορίας δεν είναι αρνητικό εύρημα. Οι καταγραφές έχουν προτεραιότητα έναντι συμπερασμάτων.
Η έξοδος παραμένει ελαφρώς δομημένη για τις ενότητες της εφαρμογής: κάθε σημείο είναι μία πλήρης, κατανοητή κλινική διατύπωση με group_label, theme, text και ακριβείς source_ids από το παρεχόμενο sources[].id. Χρησιμοποίησε μόνο πραγματικά IDs πηγών και περιέλαβε κάθε απαιτούμενο required_correction_ids για τις πηγές που αναφέρεις.
Κριτήριο επιτυχίας: σε περίπου 30 δευτερόλεπτα ο ψυχίατρος να καταλαβαίνει την εικόνα και την πορεία, όχι να ξαναδιαβάζει 12 συνεδρίες.`;
const themes=['general','medication','course','risk','psychometrics','plan','context'];
const schemaFor=sourceIds=>({type:'object',properties:{findings:{type:'array',minItems:1,maxItems:8,items:{type:'object',properties:{text:{type:'string',minLength:12},source_ids:{type:'array',minItems:1,maxItems:12,items:{type:'string',enum:sourceIds}},group_label:{type:'string',minLength:2,maxLength:32},theme:{type:'string',enum:themes}},required:['text','source_ids','group_label','theme'],additionalProperties:false}}},required:['findings'],additionalProperties:false});
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await mkdir('public',{recursive:true});
const save=async()=>{
 await writeFile('public/summary-v2-ab.json',JSON.stringify(report,null,2));
 await writeFile('public/summary-v2-ab.html','<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NOIMA Summary A/B</title><style>body{max-width:1040px;margin:45px auto;padding:0 24px;font:16px/1.6 system-ui;color:#273b32}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}section{padding:18px;border:1px solid #ccd8d1;border-radius:12px;white-space:normal}li{margin:10px 0}small{color:#576c60}@media(max-width:780px){main{display:block}section{margin-bottom:18px}}</style></head><body><h1>NOIMA — Clinical Summary A/B</h1><p>3 φανταστικοί ασθενείς × 12 επισκέψεις. Παλιό αγγλικό prompt εναντίον νέου ελληνικού prompt με το ίδιο μοντέλο, ίδιο schema και ίδιες καταγραφές. Ερευνητικές έξοδοι, όχι κλινικά εγκεκριμένες.</p><p>Κατάσταση: <b>'+escape(report.status)+'</b> · Κλήσεις: '+report.provider_calls_attempted+' / 6 · Μοντέλο: '+escape(report.model)+'</p>'+['A','B','C'].map(id=>'<h2>Ασθενής '+id+'</h2><main>'+['baseline','v2'].map(arm=>{const r=report.results.find(x=>x.patient===id&&x.arm===arm);return '<section><h3>'+escape(arm==='baseline'?'Υφιστάμενο prompt':'Νέο ελληνικό prompt')+'</h3><small>'+escape(r?.status||'pending')+'</small>'+(r?.findings?'<ol>'+r.findings.map(f=>'<li><b>'+escape(f.group_label)+'</b> '+escape(f.text)+' <small>('+escape((f.source_ids||[]).length)+' πηγές)</small></li>').join('')+'</ol>':'<p>'+escape(r?.error||'Δεν εκτελέστηκε')+'</p>')+'</section>'}).join('')+'</main>').join('')+'<p><a href="/summary-v2-ab.json">Πλήρη αποτελέσματα JSON</a></p></body></html>');
};
await save();
const allowed=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF===branch;
if(!allowed) {report.reason='Not the isolated preview branch';await save();process.exit(0);}
if(!process.env.OPENAI_API_KEY || !report.model){report.reason='Provider credentials or model not configured for Preview';await save();process.exit(0);}
const src=await readFile('app/api/clinical/summary/route.ts','utf8');
const match=src.match(/const CLINICAL_WRITING_PROMPT=`([\s\S]*?)`;/);
if(!match || match[1].includes('${')) {report.reason='Unable to extract exact baseline prompt';await save();process.exit(0);}
const baseline=match[1],cases=makePatients(12);
const endpoint=(process.env.OPENAI_BASE_URL||'https://api.openai.com/v1')+'/responses';
report.status='running';await save();
outer:for(let i=0;i<cases.length && i<3;i++) {
 const c=buildSummaryContext(cases[i],'2026-10-16');
 const input=JSON.stringify(providerEvidence({as_of:c.day,sources:c.sources,corrections:c.layers.corrections}));
 const schema=schemaFor(c.sources.map(s=>s.id));
 for(const [arm,instructions] of [['baseline',baseline],['v2',v2]]){
  const item={patient:['A','B','C'][i],arm,status:'pending',input_characters:input.length,source_count:c.sources.length};
  report.results.push(item);await save();
  if(report.provider_calls_attempted>=6){item.status='budget_exhausted';break outer;}
  report.provider_calls_attempted++;await save();
  const started=Date.now();
  try {
   const res=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(55000),headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:report.model,store:false,instructions,input,max_output_tokens:1900,text:{format:{type:'json_schema',name:'clinical_evidence',strict:true,schema}}})});
   item.http_status=res.status;
   if(!res.ok){item.status='provider_error';item.error='HTTP '+res.status;await save();break outer;}
   const response=await res.json();const raw=response.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
   if(response.status!=='completed'||!raw)throw Error('Provider returned no completed JSON output');
   const parsed=JSON.parse(raw);
   if(!Array.isArray(parsed.findings))throw Error('Invalid findings schema');
   item.findings=parsed.findings;item.status='completed';item.elapsed_ms=Date.now()-started;item.usage=response.usage||null;
  }catch(error){item.status='failed_no_retry';item.error=String(error.message||error).slice(0,180);await save();break outer;}
  await save();
 }
}
report.status=report.results.length===6 && report.results.every(x=>x.status==='completed')?'completed':'partial_or_unavailable';
await save();
console.log('SUMMARY_V2_AB',JSON.stringify({status:report.status,calls:report.provider_calls_attempted,model:report.model,results:report.results.map(x=>({patient:x.patient,arm:x.arm,status:x.status,error:x.error||null}))}));
