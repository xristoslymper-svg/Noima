import assert from 'node:assert/strict';
const base=process.env.BOOKING_LIVE_URL;if(!base||new URL(base).hostname!=='noima-git-codex-public-booking-calendar-xristoslymper-3481.vercel.app')throw new Error('Exact read-only booking preview required');
const site=new URL(base),api=new URL('/api/presence/public',site);api.searchParams.set('slug',site.pathname.split('/').pop());
let response;for(let i=0;i<18;i++){response=await fetch(api,{redirect:'manual'});if(response.status===200&&response.headers.get('content-type')?.includes('json'))break;if(i===17)throw new Error('Public availability did not become ready: '+response.status);await new Promise(r=>setTimeout(r,10000))}
const data=await response.json();assert.deepEqual(Object.keys(data).sort(),['enabled','slots','timezone']);assert.equal(typeof data.enabled,'boolean');assert.equal(data.timezone,'Europe/Athens');for(const slot of data.slots)assert.deepEqual(Object.keys(slot).sort(),['end','start']);
const page=await fetch(site,{redirect:'manual'});assert.equal(page.status,200);assert.match(await page.text(),/Αίτημα ραντεβού/);
const owner=await fetch(new URL('/api/presence/booking',site),{redirect:'manual'});assert.equal(owner.status,401);
const google=await fetch(new URL('/api/presence/google/callback',site));assert.equal(google.status,503);assert.equal((await google.json()).code,'google_business_not_enabled');
console.log('PASS: hosted anonymous practice/availability, no calendar identities, authenticated owner gate, real Google disabled. GET only; no writes.');
