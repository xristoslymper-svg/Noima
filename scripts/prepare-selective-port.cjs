/* One-time pinned, allow-listed port. Never run on main. Removed from delivered source. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),ts=require('typescript');
const BASE='27e61cefd3a7bb568a73a02a4e08ebf70a9a762a',SOURCE='a095f231c97bd653f110b152ff4c7144f9f84645';
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:20*1024*1024});
const read=(file,ref=SOURCE)=>git('show',ref+':'+file);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value)}
function once(value,old,next,label){if(value.split(old).length!==2)throw Error('Ambiguous port: '+label);return value.replace(old,next)}
const dictionary=JSON.parse(read('i18n/messages/el.json'));
function lookup(key){const value=key.split('.').reduce((o,k)=>o?.[k],dictionary);if(typeof value!=='string')throw Error('Missing Greek copy: '+key);return value}
function greek(file){
 const source=read(file),root=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),edits=[];
 function replace(node,text){edits.push([node.getStart(root),node.end,text])}
 function visit(node){
  if(ts.isImportDeclaration(node)&&(/^(?:@\/i18n\/|next-intl)/.test(node.moduleSpecifier.text))){replace(node,'');return}
  if(ts.isVariableStatement(node)&&node.declarationList.declarations.length===1){const d=node.declarationList.declarations[0];if(d.initializer&&ts.isCallExpression(d.initializer)&&d.initializer.expression.getText(root)==='useTranslations'){replace(node,'');return}}
  if(ts.isCallExpression(node)){
   const name=node.expression.getText(root);
   if(name==='useOptionLabel'||name==='useSystemMessage'){replace(node,'((value:string)=>value)');return}
   if(name==='useLocale'){replace(node,"String('el-GR')");return}
   if(name==='t'&&ts.isStringLiteral(node.arguments[0])){
    const key=node.arguments[0].text,text=lookup(key);
    if(/\{[^{}]*,\s*(plural|select)/.test(text)){
     const head=text.match(/^\{(\w+),\s*plural,/),forms=[...text.matchAll(/(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g)];
     if(!head||!forms.length||!forms.some(form=>form[1]==='other')||node.arguments.length!==2)throw Error('Explicit ICU port required: '+key+' '+text);
     const values=node.arguments[1].getText(root),count='Number(('+values+').'+head[1]+')';
     let expression=JSON.stringify(forms.find(form=>form[1]==='other')[2]);
     for(const form of forms.filter(form=>form[1]!=='other').reverse()){const condition=form[1].startsWith('=')?count+'==='+Number(form[1].slice(1)):'new Intl.PluralRules("el-GR").select('+count+')==='+JSON.stringify(form[1]);expression='('+condition+'?'+JSON.stringify(form[2])+':'+expression+')'}
     replace(node,'('+expression+'.replace(/#/g,String('+count+')))');return;
    }
    if(node.arguments.length>1){const values=node.arguments[1].getText(root);replace(node,'('+JSON.stringify(text)+'.replace(/\\{(\\w+)\\}/g, (_match, key) => String(('+values+' as Record<string, unknown>)[key] ?? "")))')}
    else replace(node,JSON.stringify(text));return;
   }
   if(name==='errorJson')replace(node.expression,'Response.json');
  }
  ts.forEachChild(node,visit);
 }
 visit(root);let output=source;for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))output=output.slice(0,start)+text+output.slice(end);
 if(/next-intl|@\/i18n\//.test(output))throw Error('Localization dependency escaped: '+file);
 return output;
}
if(!process.env.GITHUB_REF?.endsWith('/feat/production-library-prior-course-20261017'))throw Error('Feature branch only');
for(const file of git('ls-files').split('\n').filter(file=>/(^|\/)AGENTS\.md$/.test(file)))console.log('REPOSITORY INSTRUCTIONS',file,'\n',fs.readFileSync(file,'utf8'));
const protectedFiles=['app/page.tsx','app/patients/page.tsx','app/patients/new/page.tsx','app/calendar/page.tsx','components/intake/IntakeLauncher.tsx','components/patients/MedicationTable.tsx','components/patients/PatientRecord.module.css','components/patients/PatientPanels.tsx','components/patients/PatientTreatment.tsx','components/patients/PatientRecordSummary.tsx','components/patients/ClinicalSummary.tsx','components/patients/VisitWorkspace.tsx','components/patients/PatientSession.tsx','components/patients/FollowupClosure.tsx','app/api/patients/demo/runtime/route.ts','lib/patients/demo-runtime.ts','lib/clinical/summary-context.ts','lib/clinical/provider-evidence.ts','lib/psychometrics/instruments.ts','lib/intake/history.ts','app/layout.tsx','app/globals.css','middleware.ts','package.json','package-lock.json'];
const hashes={};for(const file of protectedFiles){const original=read(file,BASE);if(fs.readFileSync(file,'utf8')!==original)throw Error('Production invariant changed: '+file);hashes[file]=hash(original)}
let library=greek('app/psychometrics/page.tsx');library=once(library,"from '@/components/intake/IntakeLauncher'","from '@/components/intake/LibraryIntakeLauncher'",'library assignment only');write('app/psychometrics/page.tsx',library);
for(const file of ['components/intake/PatientIntakeForm.tsx','app/api/intake/public/route.ts','app/intake/blank/BlankPrint.tsx'])write(file,greek(file));
for(const file of ['lib/intake/demographics.ts','components/intake/QuickIntakeAssignment.module.css','supabase/migrations/20261016183701_patient_prior_course.sql'])write(file,read(file));
let timeline=read('components/patients/PatientTimeline.tsx',BASE);
timeline=once(timeline,"'use client';","'use client';\nimport type {MutableRefObject} from 'react';\nimport PriorCourseSection from './PriorCourseSection';",'timeline imports');
timeline=once(timeline,'onTreatment,viewer}:{','onTreatment,viewer,beforeNavigate,priorCourseEnabled=false}:{','timeline props');
timeline=once(timeline,'bundle:PatientBundle;','beforeNavigate?:MutableRefObject<(()=>Promise<void>)|null>;priorCourseEnabled?:boolean;bundle:PatientBundle;','timeline types');
timeline=once(timeline,'<h2>Επισκέψεις</h2>','<h2>Επισκέψεις</h2>\n  {priorCourseEnabled&&<PriorCourseSection key={bundle.patient.id} patientId={bundle.patient.id} beforeNavigate={beforeNavigate}/>}','prior course insertion');write('components/patients/PatientTimeline.tsx',timeline);
let workspace=read('components/patients/PatientWorkspace.tsx',BASE);
workspace=once(workspace,'viewer={null}/>','viewer={null} beforeNavigate={sectionBeforeNavigate} priorCourseEnabled={!previewBundle}/>','timeline integration');write('components/patients/PatientWorkspace.tsx',workspace);
write('tests/selective-production-contract.json',JSON.stringify({base:BASE,source:SOURCE,hashes,workspaceHash:hash(read('components/patients/PatientWorkspace.tsx',BASE))},null,2)+'\n');
for(const file of ['.github/workflows/selective-port-source.yml','.github/workflows/prepare-selective-production-port.yml','scripts/prepare-selective-port.cjs'])fs.rmSync(file,{force:true});
console.log('Protected production files:',Object.keys(hashes).length);console.log(git('diff','--stat'));console.log(git('status','--short'));
