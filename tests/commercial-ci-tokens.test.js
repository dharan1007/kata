import test from 'node:test';
import assert from 'node:assert/strict';
import {issueCiToken,verifyCiToken,revokeCiToken} from '../lib/commercial/ci-tokens.js';
import {deriveEffectiveEntitlements} from '../lib/commercial/entitlements.js';

class Store{
  constructor(){this.records=[];this.user={id:'u1'};this.project={id:'p1',organizationId:'o1'};this.environment={id:'e1',projectId:'p1'};}
  async getProject(id){return id==='p1'?this.project:id==='p2'?{id:'p2',organizationId:'o1'}:null;}
  async getEnvironment(id){return id==='e1'?this.environment:null;}
  async getUserBySubject(){return this.user;}
  async getMembership(org,user){return org==='o1'&&user==='u1'?{role:'OWNER'}:null;}
  async insertCiToken(record){const stored={id:`ci${this.records.length+1}`,...record,revokedAt:null};this.records.push(stored);return stored;}
  async getCiTokenByPrefix(prefix){return this.records.find(x=>x.prefix===prefix)??null;}
  async getCiTokenById(id){return this.records.find(x=>x.id===id)??null;}
  async touchCiToken(){}
  async revokeCiToken(id,at){const r=await this.getCiTokenById(id);r.revokedAt=at;return r;}
}
const actor={type:'user',authn:'identity-session',subject:'sub-1',email:'a@example.test'};
const pepper='pepper-for-ci-token-tests';

test('CI tokens are one-time reveal hash-only credentials with project and environment scope',async()=>{
  const store=new Store();
  const entitlements=deriveEffectiveEntitlements({billingState:'ACTIVE',planId:'team'}).capabilities;
  const issued=await issueCiToken({store,actor,projectId:'p1',environmentId:'e1',scopes:['runs:create','runs:read'],entitlements,pepper});
  assert.match(issued.token,/^kata_ci_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+$/);
  assert.equal(store.records[0].token,undefined);
  assert.equal(store.records[0].secret,undefined);
  assert.match(store.records[0].tokenHash,/^[0-9a-f]{64}$/);
  const principal=await verifyCiToken({store,presentedToken:issued.token,requiredScope:'runs:create',projectId:'p1',environmentId:'e1',pepper});
  assert.equal(principal.authn,'ci-token');
  assert.equal(principal.projectId,'p1');
  await assert.rejects(()=>verifyCiToken({store,presentedToken:issued.token,requiredScope:'runs:create',projectId:'p2',environmentId:'e1',pepper}),error=>error?.code==='FORBIDDEN');
  await revokeCiToken({store,actor,tokenId:issued.record.id});
  await assert.rejects(()=>verifyCiToken({store,presentedToken:issued.token,requiredScope:'runs:create',projectId:'p1',environmentId:'e1',pepper}),error=>error?.code==='CI_TOKEN_REVOKED');
});

test('CI issuance is entitlement and scope gated',async()=>{
  const store=new Store();
  const free=deriveEffectiveEntitlements({billingState:'FREE',planId:'free'}).capabilities;
  await assert.rejects(()=>issueCiToken({store,actor,projectId:'p1',environmentId:null,scopes:['runs:create'],entitlements:free,pepper}),error=>error?.code==='ENTITLEMENT_REQUIRED');
  const developer=deriveEffectiveEntitlements({billingState:'ACTIVE',planId:'developer'}).capabilities;
  await assert.rejects(()=>issueCiToken({store,actor,projectId:'p1',environmentId:null,scopes:['ci:enforce'],entitlements:developer,pepper}),error=>error?.code==='ENTITLEMENT_REQUIRED');
});
