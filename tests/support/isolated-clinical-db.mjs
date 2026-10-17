import {PGlite} from '@electric-sql/pglite';
import {readFile, readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {storageSchemaSql} from './storage-schema.mjs';

const identifier = value => {
  if (!/^[a-z_][a-z_0-9]*$/.test(value)) throw new Error('invalid_fixture_identifier');
  return '"' + value + '"';
};

// Exact repository SQL runs in a fresh PostgreSQL instance. Only schemas owned
// by the external Supabase service and its verified JWT identity are emulated.
// Never accepts a remote URL, credential, database connection or real patient.
export async function createIsolatedClinicalDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key, email text, email_confirmed_at timestamptz,
      deleted_at timestamptz, banned_until timestamptz
    );
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
  `);
  await db.exec(storageSchemaSql);
  const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  for (const name of migrations) {
    try { await db.exec(await readFile('supabase/migrations/' + name, 'utf8')); }
    catch (error) { await db.close(); throw new Error(name + ': ' + error.message); }
  }
  const sql = async (text, params = []) => (await db.query(text, params)).rows;
  let queue = Promise.resolve();
  const serialized = fn => {
    const pending = queue.then(fn);
    queue = pending.catch(() => {});
    return pending;
  };
  const asUser = (actor, fn) => serialized(async () => {
    await db.exec('begin; set local role ' + (actor ? 'authenticated' : 'anon'));
    await sql("select set_config('request.jwt.claim.sub',$1,true)", [actor || '']);
    try { const result = await fn(sql); await db.exec('commit'); return result; }
    catch (error) { await db.exec('rollback'); throw error; }
  });
  const admin = (text, params = []) => serialized(() => sql(text, params));
  const query = (actor, text, params = []) => asUser(actor, q => q(text, params));
  async function rpc(actor, name, args = {}) {
    const keys = Object.keys(args);
    const fn = identifier(name);
    const functions = await admin(`select p.proargnames,p.proretset,t.typtype,
      array(select format_type(oid,null) from unnest(p.proargtypes::oid[]) oid) argument_types
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_type t on t.oid=p.prorettype
      where n.nspname='public' and p.proname=$1`, [name]);
    const type = functions.find(row => keys.every(key => row.proargnames?.includes(key)));
    if (!type) throw new Error('fixture_function_not_found:' + name);
    const parameterType = key => type.argument_types[type.proargnames.indexOf(key)];
    const parameters = keys.map((key, index) => identifier(key) + ' => $' + (index + 1) + '::' + parameterType(key));
    const values = keys.map(key => {
      if (args[key] == null || typeof args[key] !== 'object') return args[key];
      if (parameterType(key).endsWith('[]') && Array.isArray(args[key])) {
        return '{' + args[key].map(value => value === null ? 'NULL' : '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"').join(',') + '}';
      }
      return JSON.stringify(args[key]);
    });
    const rows = await query(actor, 'select to_jsonb(public.' + fn + '(' + parameters.join(',') + ')) value', values);
    return type?.proretset || type?.typtype === 'c' ? rows.map(row => row.value) : rows[0]?.value ?? null;
  }
  async function read(actor, path) {
    const url = new URL(path, 'http://isolated.invalid/');
    const table = identifier(url.pathname.split('/').pop());
    const selected = url.searchParams.get('select') || '*';
    const fields = selected === '*' ? '*' : selected.split(',').map(identifier).join(',');
    const filters = [], values = [];
    for (const [key, value] of url.searchParams) {
      if (['select', 'order', 'limit'].includes(key)) continue;
      if (value.startsWith('eq.')) {
        values.push(value.slice(3));
        filters.push(identifier(key) + '=$' + values.length);
      } else if (value === 'is.null') filters.push(identifier(key) + ' is null');
      else if (value === 'not.is.null') filters.push(identifier(key) + ' is not null');
      else throw new Error('unsupported_fixture_filter:' + value);
    }
    let text = 'select ' + fields + ' from public.' + table;
    if (filters.length) text += ' where ' + filters.join(' and ');
    if (url.searchParams.has('order')) text += ' order by ' + url.searchParams.get('order').split(',').map(part => {
      const [column, direction] = part.split('.');
      return identifier(column) + (direction === 'desc' ? ' desc' : ' asc');
    }).join(',');
    if (url.searchParams.has('limit')) text += ' limit ' + Math.min(1000, Number(url.searchParams.get('limit')) || 1);
    return query(actor, text, values);
  }
  async function clinician(label = 'QA Synthetic Doctor') {
    const id = randomUUID();
    await admin('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, id + '@example.invalid']);
    const identity = await rpc(id, 'pilot_join', {p_name: label});
    await rpc(id, 'demo_tester_bootstrap', {p_tester: identity.workspace_id});
    return {id, workspace: identity.workspace_id, identity};
  }
  async function patient(actor, name = 'QA SYNTHETIC existing patient') {
    const rows = await rpc(actor.id, 'demo_patient_create_v2', {p_tester: actor.workspace, p_first_name: name});
    return Array.isArray(rows) ? rows[0] : rows;
  }
  return {
    migrations, admin, query, asUser, rpc, read, clinician, patient,
    close: async () => { await queue; await db.close(); },
  };
}
