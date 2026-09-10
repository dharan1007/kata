import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryCommercialStore} from './helpers/commercial-store.js';
import {provisionAccount} from '../lib/commercial/identity.js';
import {requireOrgRole,requireProjectAccess,requireSafeSessionMutation} from '../lib/commercial/authz.js';

const principal=(subject,email=`${subject}@example.com`)=>({type:'user',authn:'identity-session',subject,email});

test('account provisioning is idempotent and creates exactly one personal OWNER tenant',async()=>{
  const store=createMemoryCommercialStore();
  const actor=principal('alice');
  const first=await provisionAccount({store,principal:actor});
  const second=await provisionAccount({store,principal:actor});
  assert.equal(first.user.id,second.user.id);
  assert.equal(first.personalOrganization.id,second.personalOrganization.id);
  assert.equal(store.users.length,1);
  assert.equal(store.organizations.length,1);
  assert.equal(store.memberships.length,1);
  assert.equal(store.memberships[0].role,'OWNER');
});

test('tenant authorization ignores identity metadata and rejects cross-tenant project access',async()=>{
  const store=createMemoryCommercialStore();
  const alice=await provisionAccount({store,principal:principal('alice')});
  const bob=await provisionAccount({store,principal:principal('bob')});
  const project=await store.insertProject({organizationId:bob.personalOrganization.id,name:'B',slug:'b',defaultTargetUrl:'https://b.example',visibility:'PRIVATE',createdBy:bob.user.id});
  const forged={...principal('alice'),role:'OWNER',plan:'team',user_metadata:{role:'OWNER'}};
  await assert.rejects(()=>requireProjectAccess({store,principal:forged,projectId:project.id,allowedRoles:['OWNER','ADMIN','MEMBER']}),error=>error.code==='FORBIDDEN');
  await assert.rejects(()=>requireOrgRole({store,principal:forged,organizationId:bob.personalOrganization.id,allowedRoles:['OWNER']}),error=>error.code==='FORBIDDEN');
  assert.notEqual(alice.personalOrganization.id,bob.personalOrganization.id);
});

test('cookie-authenticated unsafe methods require exact same-origin Origin',()=>{
  const actor=principal('alice');
  assert.doesNotThrow(()=>requireSafeSessionMutation({request:new Request('https://kata.example/api/projects',{method:'POST',headers:{Origin:'https://kata.example'}}),principal:actor,expectedOrigin:'https://kata.example'}));
  for(const origin of [undefined,'https://evil.example','https://kata.example.evil.test','null']){
    const headers=origin?{Origin:origin}:{};
    assert.throws(()=>requireSafeSessionMutation({request:new Request('https://kata.example/api/projects',{method:'POST',headers}),principal:actor,expectedOrigin:'https://kata.example'}),error=>error.code==='CSRF_ORIGIN_REQUIRED');
  }
});

test('safe methods and explicit API principals do not inherit browser CSRF semantics',()=>{
  assert.doesNotThrow(()=>requireSafeSessionMutation({request:new Request('https://kata.example/api/projects'),principal:principal('alice'),expectedOrigin:'https://kata.example'}));
  assert.doesNotThrow(()=>requireSafeSessionMutation({request:new Request('https://kata.example/api/projects',{method:'POST'}),principal:{type:'service',authn:'api-key',organizationId:'org-1',scopes:['runs:create']},expectedOrigin:'https://kata.example'}));
});
