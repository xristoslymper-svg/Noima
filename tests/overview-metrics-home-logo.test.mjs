import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const overview=readFileSync('app/page.tsx','utf8');
const css=readFileSync('app/globals.css','utf8');

test('Overview KPI cards contain only titles, numeric values and icons',()=>{
 for(const heading of ['Επόμενα ραντεβού σήμερα','Εκκρεμότητες','Υποβολές ασθενών','Πληρωμές'])assert.ok(overview.includes(heading),heading);
 assert.match(overview,/function Metric\(\{ icon, label, value, tone, onClick \}/);
 assert.match(overview,/const content=<><div className="metric-icon">\{icon\}<\/div><span>\{label\}<\/span><strong>\{value\}<\/strong><\/>/);
 assert.match(overview,/className="metric rose metric-action" onClick=\{onOpen\}/);
 assert.match(overview,/<span>Εκκρεμότητες<\/span><strong>\{value\}<\/strong>/);
 assert.doesNotMatch(overview,/<small>\{note\}<\/small>/);
 assert.doesNotMatch(overview,/ note=\{/);
 assert.match(overview,/\.filter\(task=>task.status==="open"\)/);
 assert.match(overview,/\.filter\(event=>event.status!=="cancelled"&&event.payment_status==="pending"\)/);
 assert.match(css,/\.metric-grid \.metric\{min-height:128px\}/);
});

test('Ψ logo links to Overview from all main screens with an accessible name',()=>{
 const paths=[
  'app/page.tsx',
  'app/calendar/page.tsx',
  'app/patients/page.tsx',
  'components/patients/PatientWorkspace.tsx',
  'app/psychometrics/page.tsx',
 ];
 for(const path of paths){
  const content=readFileSync(path,'utf8');
  assert.match(content,/<Link href="\/" className="brand-mark" aria-label="Μετάβαση στην Επισκόπηση" title="Επισκόπηση">Ψ<\/Link>/,path);
  assert.doesNotMatch(content,/<div className="brand-mark">Ψ<\/div>/,path);
 }
 assert.match(css,/\.sidebar a\.brand-mark:focus-visible/);
});

test('existing navigation and modal actions are not removed',()=>{
 assert.match(overview,/setWidgetOpen\("todo"\)/);
 assert.match(overview,/setWidgetOpen\("psychometrics"\)/);
 assert.match(overview,/setWidgetOpen\("payments"\)/);
 assert.match(overview,/href===?"\/"\?"nav-item active"/);
 assert.match(overview,/overviewState==='ready'\?String\(upcomingToday.length\):'—'/);
});
