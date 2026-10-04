// Generate an email-bound invitation for manual administrator provisioning.
// This script performs no network calls and sends no email.
import {randomBytes,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const [email,outputPath]=process.argv.slice(2);
if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!outputPath)throw Error('Usage: node scripts/pilot-invite.mjs email output-file.json (keep outside the repository)');
const code=randomBytes(24).toString('hex'),hash=createHash('sha256').update(code).digest('hex');
const safeEmail=email.toLowerCase().replaceAll("'","''");
await writeFile(outputPath,JSON.stringify({email,code,sql:`insert into private.pilot_invitations(token_hash,email) values ('${hash}','${safeEmail}');`},null,2),{flag:'wx',mode:0o600});
console.log('Invitation saved. Apply its SQL as administrator; share its code only with the named recipient.');
