import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {priorCourseFeatureUnavailable} from '../lib/clinical/prior-course-errors.ts';

test('missing retrospective course RPC is recognized for read and save',()=>{
 assert.equal(priorCourseFeatureUnavailable(new Error('Could not find the function public.demo_prior_course_save(p_patient, p_request) in the schema cache')),true);
 assert.equal(priorCourseFeatureUnavailable(new Error('Could not find the function public.demo_prior_course_get(p_patient) in the schema cache')),true);
 assert.equal(priorCourseFeatureUnavailable(new Error('function public.demo_prior_course_save does not exist')),true);
});
test('do not report every unrelated database error as an unavailable feature',()=>{
 assert.equal(priorCourseFeatureUnavailable(new Error('stale_prior_course')),false);
 assert.equal(priorCourseFeatureUnavailable(new Error('Could not find the function public.demo_task_list')),false);
 assert.equal(priorCourseFeatureUnavailable(new Error('Permission denied on the patient record')),false);
});
test('the UI checks feature availability before offering to save',()=>{
 const route=readFileSync('app/api/patients/demo/prior-course/route.ts','utf8');
 const ui=readFileSync('components/patients/PriorClinicalCourse.tsx','utf8');
 assert.match(route,/prior_course_unavailable/);
 assert.match(ui,/featureReady===false/);
 assert.match(ui,/priorCourse.unavailable/);
});
