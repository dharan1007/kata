import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryCommercialStore} from './helpers/commercial-store.js';
import {provisionAccount} from '../lib/commercial/identity.js';
import {createOrganization,createInvitation,acceptInvitation,changeMemberRole,removeMember} from '../lib/commercial/organizations.js';
import {createProject,createEnvironment,validateTargetUrl} from '../lib/commercial/projects.js';

const p=(subject,email=`${subject}@example.com`)=>({type:'user',authn:'identity-session',subject,email});

test('team invitations are one-time hash-only email-bound credentials',async()=>{
  const store=createMemoryCommercialStore();
  const owner=await provisionAccount({store,principal:p('owner')});
  const team=await createOrganization({store,actor:p('owner'),name:'Acme Team'});
  const issued=await createInvitation({store,actor:p('owner'),organizationId:team.id,email:'Member@Example.com',role:'MEMBER',expiresInSeconds:3600,pepper:'test-pepper'});
  assert.match(issued.token,/^kata_inv_/);
  const persisted=store.invitations[0];
  assert.equal('token' in persisted,false);
  assert.equal(persisted.email,'member@example.com');
  assert.match(persisted.tokenHash,/^[a-f0-9]{64}$/);
  await assert.rejects(()=>acceptInvitation({store,principal:p('other'),token:issued.token,pepper:'test-pepper'}),error=>error.code==='INVITATION_EMAIL_MISMATCH');
  const joined=await acceptInvitation({store,principal:p('member','member@example.com'),token:issued.token,pepper:'test-pepper'});
  assert.equal(joined.membership.role,'MEMBER');
  await assert.rejects(()=>acceptInvitation({store,principal:p('member','member@example.com'),token:issued.token,pepper:'test-pepper'}),error=>error.code==='INVITATION_ALREADY_USED');
  assert.ok(owner.personalOrganization.id);
});

test('membership changes cannot leave an organization without an OWNER',async()=>{
  const store=createMemoryCommercialStore();
  await provisionAccount({store,principal:p('owner')});
  const team=await createOrganization({store,actor:p('owner'),name:'Team'});
  const ownerUser=store.users.find(x=>x.subject==='owner');
  await assert.rejects(()=>changeMemberRole({store,actor:p('owner'),organizationId:team.id,userId:ownerUser.id,role:'ADMIN'}),error=>error.code==='FINAL_OWNER_REQUIRED');
  await assert.rejects(()=>removeMember({store,actor:p('owner'),organizationId:team.id,userId:ownerUser.id}),error=>error.code==='FINAL_OWNER_REQUIRED');
});

test('project targets accept only credential-free HTTP(S) URLs and do not fetch them',async()=>{
  assert.equal(validateTargetUrl('https://app.example/path').origin,'https://app.example');
  for(const value of ['javascript:alert(1)','file:///etc/passwd','ftp://example.com','https://user:pass@example.com'])assert.throws(()=>validateTargetUrl(value),error=>error.code==='INVALID_TARGET_URL');

  const store=createMemoryCommercialStore();
  await provisionAccount({store,principal:p('owner')});
  const org=store.organizations[0];
  const project=await createProject({store,actor:p('owner'),organizationId:org.id,name:'App',slug:'app',defaultTargetUrl:'https://app.example',visibility:'PRIVATE'});
  const env=await createEnvironment({store,actor:p('owner'),projectId:project.id,name:'production',targetUrl:'https://app.example'});
  assert.equal(env.expectedOrigin,'https://app.example');
  await assert.rejects(()=>createProject({store,actor:p('owner'),organizationId:org.id,name:'Dup',slug:'app',defaultTargetUrl:'https://other.example',visibility:'PRIVATE'}),error=>error.code==='PROJECT_SLUG_EXISTS');
});
