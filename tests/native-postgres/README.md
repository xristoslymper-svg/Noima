# Isolated PostgreSQL release gate

`npm test` continues to use PGlite without any network database. For real concurrent
transactions, provision a **fresh, disposable local PostgreSQL 17 database** with a
name beginning `noima_release_gate_`. This gate applies the full migration chain
and creates only fictional fixtures. Never point it at hosted Supabase, a tunnel,
or a database with existing application data. The URL guard accepts only loopback
addresses and the dedicated test-name prefix. The test user needs schema/role
creation privileges in this isolated cluster; PostgreSQL roles are cluster-wide.

```powershell
$env:NOIMA_NATIVE_TEST_URL='postgresql://postgres@127.0.0.1:55465/noima_release_gate_fresh'
npm run test:postgres
```

Use a separate fresh database to run the existing database suite natively:

```powershell
$env:NOIMA_NATIVE_TEST_URL='postgresql://postgres@127.0.0.1:55465/noima_release_gate_suite_fresh'
node --experimental-strip-types --test tests/database.test.mjs
Remove-Item Env:NOIMA_NATIVE_TEST_URL
```

The concurrency gate checks actual blocking via `pg_blocking_pids` before releasing
the first transaction; it does not infer concurrency from sequential calls. Tests
use the default READ COMMITTED isolation, matching the normal RPC workflow.
Statements have five-second timeouts and lock waits have four-second timeouts.
The auth schema/JWT role context is emulated; this is not a complete Supabase Auth,
PostgREST or hosted advisor certification. Timestamp parsing preserves database
microseconds so version checks match PostgREST strings.

The gate writes a before/after function-grant/RLS/index snapshot to
`../native-security-comparison.json`. Local CLI advisor commands can be run with
an explicit loopback `--db-url` and `?sslmode=disable`; do not use `--linked` for
this verification. Hosted staging application, migration-history registration,
PostgREST schema reload and authenticated browser smoke tests remain separate gates.
