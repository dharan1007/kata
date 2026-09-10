import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryCommercialStore} from './helpers/commercial-store.js';
import {createCommercialRouter} from '../lib/commercial/router.js';

function identity(user){return{async getPrincipal(){return user;}};}
const alice={type:'user',authn:'identity-session',subject:'alice',email:'alice@example.com'};

test('account endpoint requires verified identity and provisions idempotently',async()=>{
  const store=createMemoryCommercialStore();
  const anonymous=createCommercialRouter({store,identity:identity(null),pepper:'pepper',expectedOrigin:'https://kata.example'});
  const denied=await anonymous.handle(new Request('https://kata.example/api/account'));
  assert.equal(denied.status,401);
  const router=createCommercialRouter({store,identity:identity(alice),pepper:'pepper',expectedOrigin:'https://kata.example'});
  const first=await router.handle(new Request('https://kata.example/api/account'));
  const second=await router.handle(new Request('https://kata.example/api/account'));
  assert.equal(first.status,200);assert.equal(second.status,200);
  assert.equal(store.users.length,1);assert.equal(store.organizations.length,1);
  const body=await first.json();assert.equal(body.ok,true);assert.equal(body.account.user.email,'alice@example.com');
  assert.equal(first.headers.get('cache-control'),'private, no-store');
});

test('unsafe cookie-session management request rejects missing or cross-origin Origin before mutation',async()=>{
  const store=createMemoryCommercialStore();
  const router=createCommercialRouter({store,identity:identity(alice),pepper:'pepper',expectedOrigin:'https://kata.example'});
  await router.handle(new Request('https://kata.example/api/account'));
  for(const headers of [{},{Origin:'https://evil.example'}]){
    const response=await router.handle(new Request('https://kata.example/api/organizations',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({name:'Injected',actorId:'attacker'})}));
    assert.equal(response.status,403);
  }
  assert.equal(store.organizations.length,1);
});

test('same-origin organization/project/key flow ignores client actor and uses no-store for secrets',async()=>{
  const store=createMemoryCommercialStore();
  const router=createCommercialRouter({store,identity:identity(alice),pepper:'pepper',expectedOrigin:'https://kata.example'});
  await router.handle(new Request('https://kata.example/api/account'));
  const headers={'content-type':'application/json',Origin:'https://kata.example'};
  const orgRes=await router.handle(new Request('https://kata.example/api/organizations',{method:'POST',headers,body:JSON.stringify({name:'Acme',actorId:'attacker'})}));
  assert.equal(orgRes.status,201);
  const org=(await orgRes.json()).organization;
  const projectRes=await router.handle(new Request('https://kata.example/api/projects',{method:'POST',headers,body:JSON.stringify({organizationId:org.id,name:'App',slug:'app',defaultTargetUrl:'https://app.example',visibility:'PRIVATE'})}));
  assert.equal(projectRes.status,201);
  const keyRes=await router.handle(new Request('https://kata.example/api/keys',{method:'POST',headers,body:JSON.stringify({organizationId:org.id,scopes:['projects:read']})}));
  assert.equal(keyRes.status,201);
  assert.equal(keyRes.headers.get('cache-control'),'no-store');
  const keyBody=await keyRes.json();assert.match(keyBody.key,/^kata_live_/);
});

test('router rejects oversized bodies and unknown routes deterministically',async()=>{
  const store=createMemoryCommercialStore();
  const router=createCommercialRouter({store,identity:identity(alice),pepper:'pepper',expectedOrigin:'https://kata.example'});
  const large='x'.repeat(140000);
  const response=await router.handle(new Request('https://kata.example/api/organizations',{method:'POST',headers:{'content-type':'application/json',Origin:'https://kata.example'},body:JSON.stringify({name:large})}));
  assert.equal(response.status,413);
  const missing=await router.handle(new Request('https://kata.example/api/not-real'));
  assert.equal(missing.status,404);
});
