import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTranslator} from 'next-intl';
import {resolveLocale,clinicalTimeZone,isLocale} from '../i18n/config.ts';
import {formatClinicDateTime} from '../lib/clinic-time.ts';
import {pilotScope} from '../lib/pilot/request-scope.ts';
import {withOutputLanguage} from '../i18n/output-language.ts';
import {errorJson} from '../i18n/errors.ts';
import {auditDictionaries} from '../scripts/check-i18n.mjs';
const dictionaries=Object.fromEntries(['el','en'].map(locale=>[locale,JSON.parse(readFileSync(new URL('../i18n/messages/'+locale+'.json',import.meta.url),'utf8'))]));
const translator=locale=>createTranslator({locale,messages:dictionaries[locale],onError:error=>{throw error}});
test('Greek is the default and an account preference wins over an explicit cookie',()=>{
 assert.equal(resolveLocale(undefined,undefined),'el');
 assert.equal(resolveLocale(undefined,'en'),'en');
 assert.equal(resolveLocale('el','en'),'el');
 assert.equal(resolveLocale('en','el'),'en');
 assert.equal(resolveLocale('fr','bogus'),'el');
 assert.equal(isLocale('__proto__'),false);
});
test('both dictionaries have complete semantic keys, valid ICU and no unused messages',()=>{
 const report=auditDictionaries();assert.deepEqual(report.errors,[]);assert.deepEqual(report.unused,[]);
});
test('English and Greek plural messages use the supplied count',()=>{
 assert.equal(translator('en')('patients.patientCount',{count:1}),'1 patient');
 assert.equal(translator('en')('patients.patientCount',{count:3}),'3 patients');
 assert.equal(translator('el')('patients.patientCount',{count:1}),'1 ασθενής');
 assert.equal(translator('el')('patients.patientCount',{count:3}),'3 ασθενείς');
});
test('dates stay in Athens across locale switches and daylight-saving boundaries',()=>{
 assert.equal(clinicalTimeZone,'Europe/Athens');
 for(const value of ['2026-03-29T00:30:00Z','2026-03-29T01:30:00Z','2026-10-25T00:30:00Z','2026-10-25T01:30:00Z']){
  const timestamp=Date.parse(value),el=formatClinicDateTime(value,'el'),en=formatClinicDateTime(value,'en');
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:clinicalTimeZone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  assert.ok(el.includes(time),el);assert.ok(en.includes(time),en);assert.equal(Date.parse(value),timestamp);
 }
});
test('API localization keeps established codes and fallback text unchanged',async()=>{
 const text='Μη έγκυρο ραντεβού.';
 const response=errorJson({error:text,code:'existing_conflict'},{status:409});
 const value=await response.json();
 assert.equal(response.status,409);assert.equal(value.error,text);assert.equal(value.code,'existing_conflict');assert.equal(value.message_key,'errors.invalidAppointment');
 assert.equal(translator('en')(value.message_key),'Invalid appointment.');
});
test('concurrent AI output languages are isolated and never alter supplied source text',async()=>{
 const input='Δεν αναφέρει αυτοκτονικό ιδεασμό. Drug 10 mg';const original=input;
 const results=await Promise.all(['el','en'].map(outputLocale=>pilotScope.run({token:'synthetic',workspace:outputLocale,outputLocale},async()=>{
  await new Promise(resolve=>setImmediate(resolve));return withOutputLanguage('Write clear Greek clinical prose.');
 })));
 assert.match(results[0],/OUTPUT LANGUAGE FOR THIS REQUEST: Greek/);
 assert.match(results[1],/OUTPUT LANGUAGE FOR THIS REQUEST: English/);
 assert.doesNotMatch(results[1],/Write clear Greek/);assert.equal(input,original);
});
