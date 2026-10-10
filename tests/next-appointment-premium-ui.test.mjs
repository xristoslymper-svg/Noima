import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const component=readFileSync('components/patients/VisitNextAppointment.tsx','utf8');
const css=readFileSync('components/patients/VisitNextAppointment.module.css','utf8');

test('next appointment uses a dedicated compact form and clear primary scheduling action',()=>{
 assert.match(component,/className=\{styles\.form\} hidden=\{!formOpen\}/);
 assert.match(component,/className=\{styles\.fields\}/);
 assert.match(component,/className=\{styles\.actions\}/);
 assert.match(component,/className=\{styles\.save\} disabled=\{!date\|\|busy\}/);
 assert.match(component,/className=\{styles\.cancel\} disabled=\{busy\} onClick=\{cancel\}/);
 assert.match(component,/className=\{styles\.trigger\}/);
 assert.match(component,/aria-controls=\{formId\}/);
 assert.match(component,/aria-pressed=\{date===item\.value\}/);
 assert.match(css,/\.form\{max-width:760px/);
 assert.match(css,/\.root \.save\{background:#317761/);
 assert.match(css,/@media\(max-width:420px\)/);
});

test('appointment workflow, unsaved-date blocker and reminder disclaimer remain intact',()=>{
 assert.match(component,/const formOpen=expanded\|\|Boolean\(date\)\|\|busy/);
 assert.match(component,/registerFlusher\('appointment'/);
 assert.match(component,/if\(date\|\|busy\)/);
 assert.match(component,/dateRef\.current\?\.focus/);
 assert.match(component,/setDate\(''\)/);
 assert.match(component,/onClick=\{\(\)=>void save\(\)\}/);
 assert.match(component,/onClick=\{cancel\}/);
 assert.match(component,/Δεν αποστέλλεται πραγματικό SMS/);
 assert.match(component,/Κινητό …/);
 assert.match(css,/\.root \[hidden\]\{display:none!important\}/);
});

test('redesign is scoped to the appointment component, not calendar or MSE',()=>{
 assert.doesNotMatch(component,/MseDomain|MseTimeline|RiskTreeEditor/);
 assert.doesNotMatch(css,/\.mse-|\.calendar-week|\.calendar-appointment/);
 const dialog=readFileSync('components/patients/FollowupClosure.tsx','utf8');
 assert.match(dialog,/VisitNextAppointment bundle=\{bundle\}/);
});
