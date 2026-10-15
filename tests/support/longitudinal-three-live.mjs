// CLOSED: the one authorized live evaluation build already ran.
// Do not restore or rerun the earlier runner without reconciling its call ledger.
// This replacement imports no provider and performs no network requests.
import {mkdir,writeFile} from 'node:fs/promises';
const notice={status:'live_audit_closed_no_retry',original_deployment_id:'dpl_4F1r5FXuLchiYCXUbmpoD6PKE7vW',original_test_commit:'7d72220886e5c27ca6a3930088643d8ea8d9182e',original_report_path:'/longitudinal-live.json',provider_calls_this_build:0,original_provider_call_count:null,reason:'Original report retrieval returned MIDDLEWARE_INVOCATION_FAILED; build-log access returned scope 403. Original live call count and responses remain unverified. Do not repeat calls.'};
await mkdir('public',{recursive:true});
await writeFile('public/audit-closure.json',JSON.stringify(notice,null,2));
await writeFile('public/index.html','<!doctype html><html lang="el"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>NOIMA audit closed</title><h1>Ο ζωντανός έλεγχος έχει κλείσει</h1><p>Δεν γίνονται νέες κλήσεις AI. Τα αποτελέσματα του αρχικού δοκιμαστικού deployment δεν έχουν επαληθευτεί.</p></html>');
console.log(JSON.stringify(notice));
