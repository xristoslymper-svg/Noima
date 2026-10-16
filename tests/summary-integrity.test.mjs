import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSummaryContext,canonicalSummaryFindings,summaryContextHash,summaryContextKey,validateNarrative,assertCriticalCoverage,narrativeRiskRequiresReview} from '../lib/clinical/summary-context.ts';
import {isClinicalId} from '../lib/clinical/identity.ts';
const fixture=()=>({patient:{id:'61dd44b6-bd6f-cd2a-c3ac-b0092d267eb1',chief_complaint:'Incomplete',note:''},sessions:[],sections:[],risks:[],history:null,medications:[],medicationEvents:[],medicationSideEffects:[],medicationRevisions:[],proposals:[],addenda:[],assessments:[],appointments:[]});
const visit=(b,id,text)=>{b.sessions.push({id,status:'completed',completed_at:`2026-10-0${id}T09:00:00Z`,started_at:`2026-10-0${id}T08:00:00Z`});b.sections.push({id:'s'+id,session_id:id,section_key:'interview',content:text});};

test('structured correction is required only for its patched source, narrative correction remains encounter-wide',()=>{
 const b=fixture();visit(b,1,'Ο ασθενής αναφέρει καλύτερο ύπνο.');
 b.sections.push({id:'m',session_id:1,section_key:'mse',content:'Αγχώδες.'});
 b.corrections=[{id:'c',session_id:1,created_at:'2026-10-05',reason:'MSE correction',patch:{mse:{after:'Ευθυμικό.'}}}];
 const c=buildSummaryContext(b);
 assert.doesNotThrow(()=>validateNarrative({findings:[{text:'Ο ασθενής αναφέρει καλύτερο ύπνο.',source_ids:['section:s1']}]},c));
 assert.throws(()=>valid���q�^