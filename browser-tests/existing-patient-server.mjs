import {createServer} from 'node:http';
import {readFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createExistingPatientApi} from '../tests/support/existing-patient-api.mjs';

const require = createRequire(import.meta.url);
const build = (process.env.NOIMA_TEST_ESBUILD_PATH
  ? require(process.env.NOIMA_TEST_ESBUILD_PATH)
  : existsSync('/tmp/noima-browser-tools/node_modules/esbuild')
    ? require('/tmp/noima-browser-tools/node_modules/esbuild')
    : require('esbuild')).build;

// Real production React components and actual API handlers; only external
// service transports are synthetic. The server is loopback-only and disposable.
export async function createExistingPatientServer(out) {
  mkdirSync(out, {recursive: true});
  await build({
    stdin: {contents: `
      import LocaleFixture from './browser-tests/LocaleFixture';
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import PatientWorkspace from './components/patients/PatientWorkspace';
      import CalendarPage from './app/calendar/page';
      import './app/globals.css';
      import './app/clinical-refinement.css';
      import './app/visit-workspace.css';
      import './app/mobile.css';
      import './app/initial-assessment.css';
      import './app/clinical-editor.css';
      import './app/noima-ui.css';
      const id=location.pathname.split('/').pop();
      createRoot(document.getElementById('root')).render(<LocaleFixture>{location.pathname==='/calendar'?<CalendarPage/>:<PatientWorkspace patientRef={id}/>}</LocaleFixture>);
    `, loader: 'jsx', resolveDir: process.cwd()},
    bundle: true, outfile: resolve(out, 'fixture.js'), jsx: 'automatic',
    define: {'process.env': '{}', 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_NOIMA_MOBILE_V2': '"0"'},
    alias: {'@': process.cwd()}, loader: {'.module.css': 'local-css'},
    plugins: [{name: 'isolated-navigation', setup(b) {
      b.onResolve({filter: /^next\/(link|navigation)$/}, args => ({path: args.path, namespace: 'isolated-navigation'}));
      b.onLoad({filter: /.*/, namespace: 'isolated-navigation'}, args => ({loader: 'jsx', resolveDir: process.cwd(), contents: args.path === 'next/link'
        ? "import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}"
        : "export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:u=>location.assign(u),replace:u=>location.replace(u),refresh:()=>location.reload()});"}));
    }}],
  });
  const api = await createExistingPatientApi();
  const doctor = await api.db.clinician('QA SYNTHETIC Existing-patient Doctor');
  const patient = await api.db.patient(doctor);
  const requests = [];
  const server = createServer(async (incoming, outgoing) => {
    const origin = 'http://127.0.0.1:' + server.address().port;
    const url = new URL(incoming.url, origin);
    outgoing.setHeader('Cache-Control', 'no-store');
    try {
      if (url.pathname.startsWith('/api/')) {
        const chunks = [];
        for await (const chunk of incoming) chunks.push(chunk);
        const raw = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(',') : value);
        const request = new Request(url, {method: incoming.method, headers, ...(['GET', 'HEAD'].includes(incoming.method) ? {} : {body: raw})});
        const response = await api.handle(request, doctor);
        requests.push({path: url.pathname, method: incoming.method, status: response.status});
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (['/fixture.js', '/fixture.css'].includes(url.pathname)) {
        outgoing.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css');
        outgoing.end(readFileSync(resolve(out, url.pathname.slice(1))));
        return;
      }
      outgoing.setHeader('Content-Type', 'text/html');
      outgoing.setHeader('Set-Cookie', 'noima-workspace-id=' + doctor.workspace + '; Path=/; SameSite=Lax');
      outgoing.end('<!doctype html><html lang="el"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><title>NOIMA Synthetic Existing Patient Verification</title><div id="root"></div><script src="/fixture.js"></script></html>');
    } catch (error) {
      requests.push({path: url.pathname, method: incoming.method, status: 500, error: error.message});
      outgoing.writeHead(500, {'Content-Type': 'application/json'});
      outgoing.end(JSON.stringify({error: error.message}));
    }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {api, doctor, patient, requests, origin, url: origin + '/patients/demo/' + patient.id,
    close: async () => { await new Promise(done => server.close(done)); await api.close(); },
  };
}

if (process.argv.includes('--serve')) {
  const fixture = await createExistingPatientServer(resolve(process.env.NOIMA_TEST_OUTPUT || '/tmp/noima-existing-patient-browser'));
  console.log(JSON.stringify({url: fixture.url, scope: 'Synthetic local verification only; actual React/API/PostgreSQL with external service adapters'}));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await fixture.close(); process.exit(0); });
}
