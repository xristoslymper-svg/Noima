// Read-only unauthenticated check of the explicitly published synthetic preview.
// No cookies, Auth token, writes, patient records or production URL.
import assert from 'node:assert/strict';
const url=process.env.PRESENCE_LIVE_URL;
assert.ok(url?.startsWith('https://noima-git-codex-public-practice-')&&url.includes('/iatreio/'));
const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
assert.equal(response.status,200,'public preview must work without a NOIMA session');
assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
const body=await response.text();assert.ok(body.includes('Δρ. Άννα Δείγμα'));assert.ok(body.includes('Αίτημα ραντεβού'));assert.ok(!body.includes('Σύνδεση στο NOIMA'));
console.log('Unauthenticated hosted synthetic practice page: passed');
