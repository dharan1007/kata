import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryCommercialStore} from './helpers/commercial-store.js';
import {provisionAccount} from '../lib/commercial/identity.js';
import {createProject,createEnvironment} from '../lib/commercial/projects.js';
import {issueCiToken,verifyCiToken,revokeCiToken} from '../lib/commercial/ci-tokens.js';

const actor={type:'user',authn:'identity-session',subject:'alice',email:'alice@example.com'};
function withCiStore(){
  const store=createMemoryCommercialStore();store.ciTokens=[];let seq=0;
  store.insertCiToken=async input=>{const row={id:`ci-${++seq}`,...input,revokedAt:null,createdAt:new Date().toISOString()};store.ciTokens.push(row);return row;};
  store.getCiTokenByPrefix=async prefix=>store.ciTokens.find(x=>x.prefix===prefix)??null;
  store.getCiTokenById=async id=>store.ciTokens.find(x=>x.id===id)??null;
  store.revokeCiToken=async(id,at)=>{const row=await store.getCiTokenById(id);if(row)row.revokedAt=at;return row;};
  store.touchCiToken=async(id,at)=>{const row=await store.getCiTokenById(id);if(row)row.lastUsedAt=at;return row;};
  store.getEnvironment=async id=>store.environments.find(x=>x.id===id)??null;
  return store;
}

test('CI token issuance is entitlement-gated and one-time/hash-only',async()=>{
  const store=withCiStore();const account=await provisionAccount({store,principal:actor});
  const project=await createProject({store,actor,organizationId:account.personalOrganization.id,name:'App',slug:'app',defaultTargetUrl:'https://app.example',visibility:'PRIVATE'});
  const env=await createEnvironment({store,actor,projectId:project.id,name:'production',targetUrl:'https://app.example'});
  await assert.rejects(()=>issueCiToken({store,actor,projectId:project.id,environmentId:env.id,scopes:['runs:create'],entitlements:{ciTokens:false},pepper:'pepper'}),error=>error.code==='FEATURE_NOT_ENTITLED');
  const issued=await issueCiToken({store,actor,projectId:project.id,environmentId:env.id,scopes:['runs:create'],entitlements:{ciTokens:true,ciEnforcement:false},pepper:'pepper'});
  assert.match(issued.token,/^kata_ci_/);assert.equal('token' in issued.record,false);assert.match(issued.record.secretHash,/^[a-f0-9]{64}$/);
  await assert.rejects(()=>issueCiToken({store,actor,projectId:project.id,environmentId:env.id,scopes:['ci:enforce'],entitlements:{ciTokens:true,ciEnforcement:false},pepper:'pepper'}),error=>error.code==='FEATURE_NOT_ENTITLED');
});

test('CI token remains bound to its project environment and exact scopes',async()=>{
  const store=withCiStore();const account=await provisionAccount({store,principal:actor});
  const a=await createProject({store,actor,organizationId:account.personalOrganization.id,name:'A',slug:'a',defaultTargetUrl:'https://a.example',visibility:'PRIVATE'});
  const b=await createProject({store,actor,organizationId:account.personalOrganization.id,name:'B',slug:'b',defaultTargetUrl:'https://b.example',visibility:'PRIVATE'});
  const env=await createEnvironment({store,actor,projectId:a.id,name:'production',targetUrl:'https://a.example'});
  const issued=await issueCiToken({store,actor,projectId:a.id,environmentId:env.id,scopes:['runs:create'],entitlements:{ciTokens:true,ciEnforcement:false},pepper:'pepper'});
  const principal=await verifyCiToken({store,presentedToken:issued.token,requiredScope:'runs:create',projectId:a.id,environmentId:env.id,pepper:'pepper'});
  assert.equal(principal.projectId,a.id);assert.equal(principal.environmentId,env.id);
  await assert.rejects(()=>verifyCiToken({store,presentedToken:issued.token,requiredScope:'runs:create',projectId:b.id,environmentId:env.id,pepper:'pepper'}),error=>error.code==='FORBIDDEN');
  await assert.rejects(()=>verifyCiToken({store,presentedToken:issued.token,requiredScope:'ci:enforce',projectId:a.id,environmentId:env.id,pepper:'pepper'}),error=>error.code==='INSUFFICIENT_SCOPE');
  await revokeCiToken({store,actor,tokenId:issued.record.id});
  await assert.rejects(()=>verifyCiToken({store,presentedToken:issued.token,requiredScope:'runs:create',projectId:a.id,environmentId:env.id,pepper:'pepper'}),error=>error.code==='CI_TOKEN_REVOKED');
});
