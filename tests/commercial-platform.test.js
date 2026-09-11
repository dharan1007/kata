import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialError} from '../lib/commercial/errors.js';
import {createNetlifyIdentityAdapter} from '../lib/platform/netlify-identity.js';
import {createOidcIdentityAdapter} from '../lib/platform/oidc-identity.js';
import {createPostgresCommercialStore} from '../lib/platform/postgres-database.js';
import {createVercelCommercialPlatform} from '../lib/platform/vercel-commercial.js';

test('commercial errors expose stable code status and bounded details',()=>{
  const error=commercialError('AUTH_REQUIRED',401,{reason:'missing session'});
  assert.equal(error.code,'AUTH_REQUIRED');
  assert.equal(error.status,401);
  assert.deepEqual(error.details,{reason:'missing session'});
});

test('identity subject comes only from verified provider result',async()=>{
  const adapter=createNetlifyIdentityAdapter({getUser:async()=>({id:'verified-user',email:'A@Example.com',user_metadata:{role:'OWNER',plan:'team'}})});
  const principal=await adapter.getPrincipal(new Request('https://kata.example/api/account'));
  assert.deepEqual(principal,{type:'user',subject:'verified-user',email:'a@example.com',authn:'identity-session'});
  assert.equal('role' in principal,false);
  assert.equal('plan' in principal,false);
});

test('identity adapter treats absent provider user as anonymous',async()=>{
  const adapter=createNetlifyIdentityAdapter({getUser:async()=>null});
  assert.equal(await adapter.getPrincipal(new Request('https://kata.example/api/account')),null);
});

test('identity adapter refuses a provider record without a stable subject',async()=>{
  const adapter=createNetlifyIdentityAdapter({getUser:async()=>({email:'a@example.com'})});
  await assert.rejects(()=>adapter.getPrincipal(new Request('https://kata.example/api/account')),error=>error.code==='IDENTITY_INVALID');
});

test('OIDC identity ignores spoofable identity headers and requires a bearer credential',async()=>{
  let calls=0;
  const adapter=createOidcIdentityAdapter({userinfoUrl:'https://identity.example.test/userinfo',fetchImpl:async()=>{calls++;throw new Error('must not call');}});
  const request=new Request('https://kata.example/api/account',{headers:{'x-user-id':'attacker','x-user-email':'attacker@example.com'}});
  assert.equal(await adapter.getPrincipal(request),null);
  assert.equal(calls,0);
});

test('OIDC identity projects only provider-verified stable claims',async()=>{
  let seenAuthorization='';
  const adapter=createOidcIdentityAdapter({
    userinfoUrl:'https://identity.example.test/userinfo',
    fetchImpl:async(_url,init)=>{
      seenAuthorization=new Headers(init.headers).get('authorization')||'';
      return new Response(JSON.stringify({sub:'user-123',email:'User@Example.com',role:'OWNER',plan:'enterprise'}),{status:200,headers:{'content-type':'application/json'}});
    }
  });
  const principal=await adapter.getPrincipal(new Request('https://kata.example/api/account',{headers:{authorization:'Bearer verified-access-token','x-user-id':'spoofed'}}));
  assert.equal(seenAuthorization,'Bearer verified-access-token');
  assert.deepEqual(principal,{type:'user',subject:'user-123',email:'user@example.com',authn:'oidc-bearer'});
  assert.equal('role' in principal,false);
  assert.equal('plan' in principal,false);
});

test('OIDC identity rejects insecure verification endpoints and fails closed on provider denial',async()=>{
  assert.throws(()=>createOidcIdentityAdapter({userinfoUrl:'http://identity.example.test/userinfo',fetchImpl:fetch}),error=>error.code==='IDENTITY_PROVIDER_NOT_CONFIGURED');
  const adapter=createOidcIdentityAdapter({userinfoUrl:'https://identity.example.test/userinfo',fetchImpl:async()=>new Response('',{status:401})});
  await assert.rejects(()=>adapter.getPrincipal(new Request('https://kata.example/api/account',{headers:{authorization:'Bearer denied'}})),error=>error.code==='AUTH_REQUIRED'&&error.status===401);
});

test('Postgres store resolves a lazy serverless pool per operation and preserves transactions',async()=>{
  let resolves=0;
  const queries=[];
  const client={
    async query(text,params=[]){queries.push({scope:'client',text,params});return{text,rows:[],rowCount:0};},
    release(){queries.push({scope:'client',text:'release',params:[]});}
  };
  const pool={
    async query(text,params=[]){queries.push({scope:'pool',text,params});return{rows:[],rowCount:0};},
    async connect(){queries.push({scope:'pool',text:'connect',params:[]});return client;}
  };
  const store=createPostgresCommercialStore({getPool:async()=>{resolves++;return pool;}});
  await store.getUserBySubject('user-1');
  await store.transaction(async tx=>{await tx.getUserBySubject('user-2');});
  assert.ok(resolves>=2);
  assert.ok(queries.some(entry=>entry.scope==='pool'&&entry.text.includes('identity_subject')));
  assert.ok(queries.some(entry=>entry.scope==='client'&&entry.text==='begin'));
  assert.ok(queries.some(entry=>entry.scope==='client'&&entry.text==='commit'));
  assert.ok(queries.some(entry=>entry.scope==='client'&&entry.text==='release'));
});

test('Vercel commercial composition declares concrete provider contracts',()=>{
  const pool={query:async()=>({rows:[],rowCount:0}),connect:async()=>({query:async()=>({rows:[],rowCount:0}),release(){}})};
  const platform=createVercelCommercialPlatform({userinfoUrl:'https://identity.example.test/userinfo',fetchImpl:async()=>new Response('',{status:401}),pool});
  assert.equal(platform.provider,'vercel');
  assert.equal(platform.identityProvider,'oidc');
  assert.equal(platform.databaseProvider,'postgres');
  assert.equal(typeof platform.identity.getPrincipal,'function');
  assert.equal(typeof platform.store.transaction,'function');
});
