import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialError} from '../lib/commercial/errors.js';
import {createNetlifyIdentityAdapter} from '../lib/platform/netlify-identity.js';

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
