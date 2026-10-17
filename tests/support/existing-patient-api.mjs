import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve, dirname, extname} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {createIsolatedClinicalDatabase} from './isolated-clinical-db.mjs';

const nativeRequire = createRequire(import.meta.url);
const repo = resolve('.');
const root = resolve(repo, 'app/api');
const namespace = 'http://isolated.supabase.invalid';
const routeName = pathname => resolve(root, pathname.slice('/api/'.length), 'route.ts');

// Runs the actual Next route, withPilot guard, request-scope authorization and
// REST client against the exact PostgreSQL migrations. The external Supabase
// Auth/REST/storage transports and AI service are deterministic local fixtures.
// It is not a substitute for a hosted Auth/Storage deployment test.
export async function createExistingPatientApi() {
  const db = await createIsolatedClinicalDatabase();
  const actorScope = new AsyncLocalStorage();
  const deferred = [];
  const calls = [];
  const modules = new Map();
  const objects = new Map();
  const faults = {upload: 0, lostUploadResponse: 0};
  const env = {
    CLINICAL_DATA_MODE: 'synthetic', EXTERNAL_AI_ENABLED: 'false',
    NEXT_PUBLIC_SUPABASE_URL: namespace,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_fixture_only',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  let providerResult = null;
  const actorId = () => actorScope.getStore()?.id || null;
  const token = () => actorId() ? 'synthetic-token:' + actorId() : '';

  async function transport(url, init = {}) {
    const parsed = new URL(typeof url === 'string' ? url : url.url);
    const headers = new Headers(init.headers);
    calls.push({path: parsed.pathname, method: init.method || 'GET'});
    if (parsed.origin === namespace && parsed.pathname.startsWith('/rest/v1/')) {
      const credential = headers.get('authorization') || '';
      const actor = credential.startsWith('Bearer synthetic-token:') ? credential.slice('Bearer synthetic-token:'.length) : null;
      try {
        const data = parsed.pathname.startsWith('/rest/v1/rpc/')
          ? await db.rpc(actor, parsed.pathname.split('/').pop(), JSON.parse(init.body || '{}'))
          : await db.read(actor, parsed.pathname.split('/').pop() + parsed.search);
        return Response.json(data);
      } catch (error) { return Response.json({message: error.message}, {status: 400}); }
    }
    if (parsed.origin === namespace && parsed.pathname.startsWith('/storage/v1/')) {
      return storageTransport(parsed, init, headers);
    }
    if (parsed.pathname.startsWith('/api/')) {
      return handle(new Request(parsed, init), actorScope.getStore());
    }
    if (parsed.origin === 'https://api.openai.com' && providerResult !== null) {
      return Response.json({status: 'completed', output: [{content: [{type: 'output_text', text: JSON.stringify(providerResult)}]}]});
    }
    throw new Error('External connection forbidden in isolated test: ' + parsed.origin + parsed.pathname);
  }

  async function storageTransport(url, init, headers) {
    const parts = url.pathname.split('/').filter(Boolean);
    const credential = headers.get('authorization') || '';
    const actor = credential.startsWith('Bearer synthetic-token:') ? credential.slice('Bearer synthetic-token:'.length) : null;
    const marker = parts.indexOf('object');
    const start = parts[marker + 1] === 'authenticated' ? marker + 2 : marker + 1;
    const bucket = parts[start], name = parts.slice(start + 1).map(decodeURIComponent).join('/');
    const key = bucket + '/' + name;
    try {
      if ((init.method || 'GET') === 'POST' && parts[marker + 1] !== 'sign') {
        if (faults.upload > 0) { faults.upload--; return Response.json({message: 'Synthetic upload failure'}, {status: 503}); }
        const bytes = Buffer.from(await new Response(init.body).arrayBuffer());
        const mime = headers.get('content-type') || 'application/octet-stream';
        const row = await db.query(actor, 'insert into storage.objects(bucket_id,name,metadata,owner_id) values($1,$2,$3::jsonb,$4) returning id', [bucket, name, JSON.stringify({size: bytes.length, mimetype: mime}), actor]);
        objects.set(key, {bytes, mime});
        if (faults.lostUploadResponse > 0) { faults.lostUploadResponse--; return Response.json({message: 'Synthetic lost upload response'}, {status: 503}); }
        return Response.json({Id: row[0].id, Key: key});
      }
      const rows = await db.query(actor, 'select id from storage.objects where bucket_id=$1 and name=$2', [bucket, name]);
      if (rows.length !== 1 || !objects.has(key)) return Response.json({message: 'object_not_found'}, {status: 404});
      const object = objects.get(key);
      return new Response(object.bytes, {headers: {'content-type': object.mime}});
    } catch (error) { return Response.json({message: error.message}, {status: 403}); }
  }

  const client = () => ({
    auth: {
      getUser: async () => ({data: {user: actorId() ? {id: actorId()} : null}, error: null}),
      getSession: async () => ({data: {session: actorId() ? {access_token: token()} : null}, error: null}),
    },
    rpc: async (name, args = {}) => {
      try { return {data: await db.rpc(actorId(), name, args), error: null}; }
      catch (error) { return {data: null, error: {message: error.message}}; }
    },
  });

  function load(filename) {
    filename = resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = {exports: {}};
    modules.set(filename, module);
    const customRequire = id => {
      if (id === 'server-only') return {};
      if (id === 'next/server') return {...nativeRequire(id), after: fn => deferred.push({fn, actor: actorScope.getStore()})};
      if (id === '@supabase/supabase-js') {
        const actual = nativeRequire(id);
        return {...actual, createClient: (url, key, options = {}) => actual.createClient(url, key, {
          ...options, global: {...options.global, fetch: transport},
        })};
      }
      let path;
      if (id.startsWith('@/')) path = resolve(repo, id.slice(2));
      else if (id.startsWith('.')) path = resolve(dirname(filename), id);
      else return nativeRequire(id);
      if (path === resolve(repo, 'lib/pilot/server')) return {pilotClient: async () => client()};
      if (extname(path) === '.json') return JSON.parse(readFileSync(path, 'utf8'));
      if (!existsSync(path)) {
        if (existsSync(path + '.ts')) path += '.ts';
        else if (existsSync(path + '.tsx')) path += '.tsx';
        else if (existsSync(resolve(path, 'index.ts'))) path = resolve(path, 'index.ts');
      }
      if (extname(path) === '.mjs' || extname(path) === '.js') return nativeRequire(path);
      return load(path);
    };
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {fileName: filename, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }}).outputText;
    const execute = vm.runInThisContext('(function(module,exports,require,__filename,__dirname,fetch,process){' + code + '\n})', {filename});
    execute(module, module.exports, customRequire, filename, dirname(filename), transport, {env});
    return module.exports;
  }

  async function handle(request, actor = null) {
    const pathname = new URL(request.url).pathname;
    const filename = routeName(pathname);
    if (!filename.startsWith(root + '/') || !existsSync(filename)) return Response.json({code: 'route_not_found'}, {status: 404});
    return actorScope.run(actor, async () => {
      const fn = load(filename)[request.method];
      return fn ? fn(request) : Response.json({code: 'method_not_allowed'}, {status: 405});
    });
  }
  async function request(actor, path, body, options = {}) {
    const origin = 'http://localhost:3137';
    const multipart = body instanceof FormData;
    return handle(new Request(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {...(body === undefined ? {} : {origin, ...(multipart ? {} : {'content-type': 'application/json'})}), ...options.headers},
      ...(body === undefined ? {} : {body: multipart ? body : JSON.stringify(body)}),
    }), actor);
  }
  return {
    db, handle, request, calls, env, objects, deferred, faults,
    setProviderResult(value) { providerResult = value; env.EXTERNAL_AI_ENABLED = 'true'; env.OPENAI_API_KEY = 'synthetic-provider-only'; },
    load,
    close: () => db.close(),
  };
}
