// Workflow adapter: synthetic Auth responses; real owner-scoped PostgreSQL.
// Local-only test adapter: real PostgreSQL migrations/RPCs, deterministic provider responses.
// It binds loopback, never connects to Supabase, and must never run in production.
import {PGlite} from '@electric-sql/pglite';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
const db=new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for(const name of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
const user={id:'99100000-0000-4000-8000-000000000001',email:'workflow@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user.id,user.email]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user.id]);
await db.query("select pilot_join('Synthetic Workflow Doctor')");
const identity=(await db.query('select pilot_identity() identity')).rows[0].identity;
const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+86400,iss:'http://127.0.0.1:55440/auth/v1'})).toString('base64url')+'.local-fixture';
const authSession=()=>({access_token:token,refresh_token:'synthetic-local-refresh',token_type:'bearer',expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,user});
const ident=x=>{if(!/^[a-z_][a-z_0-9]*$/.test(x))throw Error('invalid_identifier');return '"'+x+'"'};
let queue=Promise.resolve();
const server=createServer((req,res)=>{queue=queue.then(async()=>{
 try{
 res.setHeader('Access-Control-Allow-Origin','http://localhost:3100');res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
 const url=new URL(req.url,'http://localhost');const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks).toString();const body=raw&&req.headers['content-type']?.includes('application/json')?JSON.parse(raw):{};
 let result;
 if(url.pathname==='/auth/v1/token'){if(body.email!==user.email&&body.refresh_token!=='synthetic-local-refresh')throw Error('fixture_user_only');result=authSession();}
 else if(url.pathname==='/auth/v1/user'){if(req.headers.authorization!=='Bearer '+token)throw Error('invalid_fixture_token');result=user;}
 else if(url.pathname==='/auth/v1/settings'){result={external:{email:true},disable_signup:true};}
 else if(url.pathname==='/fixture'){result={identity,user};}
 else if(url.pathname==='/v1/responses'){
  if(body.input?.includes('TEST_EXTRACTION_FAILURE')){res.writeHead(503);res.end('{}');return}
  result={output:[{content:[{type:'output_text',text:JSON.stringify({clinical_text:body.input,facts:[]})}]}]};
 }else if(url.pathname==='/v1/audio/transcriptions'){result={text:'Δεν ρώτησα για αυτοκτονικό ιδεασμό. Δοκιμαστική μεταγραφή.'};}
 else if(url.pathname.startsWith('/rest/v1/rpc/')){
  await db.exec('set role '+(req.headers.authorization==='Bearer '+token?'authenticated':'anon'));
  const name=url.pathname.split('/').pop();const keys=Object.keys(body);const args=keys.map((k,i)=>ident(k)+'=> $'+(i+1));
  const {rows}=await db.query('select to_jsonb(public.'+ident(name)+'('+args.join(',')+')) as data',keys.map(k=>typeof body[k]==='object'&&body[k]!==null?JSON.stringify(body[k]):body[k]));result=rows[0]?.data;
 }else if(url.pathname.startsWith('/rest/v1/')){
  await db.exec('set role '+(req.headers.authorization==='Bearer '+token?'authenticated':'anon'));const table=ident(url.pathname.split('/').pop());const select=url.searchParams.get('select')||'*';const fields=select==='*'?'*':select.split(',').map(ident).join(',');let sql='select '+fields+' from public.'+table;const filters=[],values=[];
  for(const [key,value] of url.searchParams){if(['select','order','limit'].includes(key))continue;if(!value.startsWith('eq.'))throw Error('unsupported_filter');values.push(value.slice(3));filters.push(ident(key)+'=$'+values.length)}
  if(filters.length)sql+=' where '+filters.join(' and ');if(url.searchParams.has('order'))sql+=' order by '+url.searchParams.get('order').split(',').map(s=>{const [k,d]=s.split('.');return ident(k)+(d==='desc'?' desc':' asc')}).join(',');if(url.searchParams.has('limit'))sql+=' limit '+Math.min(1000,Number(url.searchParams.get('limit'))||1);result=(await db.query(sql,values)).rows;
 }else{res.writeHead(404);res.end();return}
 await db.exec('reset role');res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result??null));
 }catch(e){await db.exec('reset role');res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:e.message}))}
 }).catch(e=>console.error(e.message))});
server.listen(55440,'127.0.0.1',()=>console.log('Local clinical test adapter ready on 55440 (mock AI, real SQL).'));
