import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalizedSource as readFileSync} from './helpers/localized-source.mjs';

const page=readFileSync(new URL('../app/calendar/page.tsx',import.meta.url),'utf8');
const home=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');

test('calendar density preserves original position and height while displaying time and patient',()=>{
 assert.match(page,/const top = \(\(startMinute - weekWindow\.start\) \/ 60\) \* weekHourHeight/);
 assert.match(page,/const height = Math\.max\(38, \(duration \/ 60\) \* weekHourHeight\)/);
 assert.match(page,/const compactEvent = height < 60/);
 assert.match(page,/const roomyEvent = height >= 66/);
 assert.match(page,/compactEvent \? <>[\s\S]*className="week-event-time"[\s\S]*className="week-event-name"/);
 assert.match(page,/role="button" tabIndex=\{0\}/);
});

test('short cards fit and cancelled names remain legible',()=>{
 assert.match(page,/\.week-event\.draggable\.compact\{padding:3px 7px!important;gap:0!important\}/);
 assert.match(page,/\.week-event\.draggable\.roomy \.week-event-name\{[^}]*-webkit-line-clamp:2/);
 assert.match(page,/\.week-event\.status-cancelled \.week-event-name\{text-decoration:none!important/);
});

test('overview removes redundant program header shortcut, preserving schedule and agreed copy',()=>{
 assert.doesNotMatch(home,/Πρόγραμμα ημέρας<\/button>/);
 assert.match(home,/sessions-title">ΠΡΟΓΡΑΜΜΑ ΗΜΕΡΑΣ/);
 assert.match(home,/<h1>Η ημέρα σας, με μια ματιά<\/h1>/);
 assert.match(home,/Ραντεβού, ασθενείς και εκκρεμότητες σε ένα μέρος/);
});
