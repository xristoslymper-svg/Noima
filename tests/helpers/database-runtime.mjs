import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';

export function localDatabaseUrl(){
 const value=process.env.NOIMA_NATIVE_TEST_URL;
 if(!value)return null;
 const url=new URL(value);
 if(url.protocol!=='postgresql:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^\/noima_release_gate_[a-z0-9_]+$/.test(url.pathname))throw new Error('Native tests require a dedicated noima_release_gate_* database on loopback');
 return value;
}
export async function databaseRuntime(){
 const url=localDatabaseUrl();
 if(!url)return new PGlite();
 const {Client,types}=await import('pg');
 // Preserve PostgreSQL microseconds, like PostgREST; JS Date loses version precision.
 types.setTypeParser(1184,value=>value);types.setTypeParser(1114,value=>value);
 const client=new Client({connectionString:url});await client.connect();
 return {query:(query,params)=>client.query(query,params),exec:query=>client.query(query),close:()=>client.end()};
}
export async function migrateTestDatabase(db,{beforeMigration,afterMigration,skipMigration}={}){
 await db.exec(`do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;end$$;
 create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const name of(await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()){
  if(skipMigration?.(name))continue;
  await beforeMigration?.(name,db);
  try{await db.exec(await readFile('supabase/migrations/'+name,'utf8'))}catch(e){throw new Error(name+': '+e.message+' '+(e.where||''))}
  await afterMigration?.(name,db);
 }
}
