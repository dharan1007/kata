import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createMemoryCommercialStore} from './helpers/commercial-store.js';
import {provisionAccount} from '../lib/commercial/identity.js';
import {issueApiKey,verifyApiKey,revokeApiKey} from '../lib/commercial/keys.js';

const actor={type:'user',authn:'identity-session',subject:'alice',email:'alice@example.com'};

test('API keys are one-time reveal, hash-only at rest, scoped and revocable',async()=>{
  const store=createMemoryCommercialStore();
  const account=await provisionAccount({store,principal:actor});
  const issued=await issueApiKey({store,actor,organizationId:account.personalOrganization.id,projectId:null,scopes:['projects:read','runs:create'],environment:'live',pepper:'pepper'});
  assert.match(issued.key,/^kata_live_[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+$/);
  assert.equal('key' in issued.record,false);
  assert.equal('secret' in issued.record,false);
  assert.match(issued.record.secretHash,/^[a-f0-9]{64}$/);
  const principal=await verifyApiKey({store,presentedKey:issued.key,requiredScope:'runs:create',pepper:'pepper'});
  assert.equal(principal.authn,'api-key');
  assert.equal(principal.organizationId,account.personalOrganization.id);
  assert.deepEqual(principal.scopes,['projects:read','runs:create']);
  await assert.rejects(()=>verifyApiKey({store,presentedKey:issued.key,requiredScope:'keys:manage',pepper:'pepper'}),error=>error.code==='INSUFFICIENT_SCOPE');
  await revokeApiKey({store,actor,keyId:issued.record.id});
  await assert.rejects(()=>verifyApiKey({store,presentedKey:issued.key,requiredScope:'runs:create',pepper:'pepper'}),error=>error.code==='API_KEY_REVOKED');
});

test('API key parsing preserves underscores inside the generated secret',async()=>{
  const store=createMemoryCommercialStore();
  const publicId='AbCdEf123456';
  const secret=`${'A'.repeat(10)}_${'B'.repeat(32)}`;
  const prefix=`kata_live_${publicId}`;
  const key=`${prefix}_${secret}`;
  const secretHash=createHmac('sha256','pepper').update(key).digest('hex');
  await store.insertApiKey({organizationId:'org-1',projectId:null,prefix,secretHash,scopes:['runs:create'],createdBy:'usr-1',expiresAt:null});

  const principal=await verifyApiKey({store,presentedKey:key,requiredScope:'runs:create',pepper:'pepper'});
  assert.equal(principal.authn,'api-key');
  assert.equal(principal.organizationId,'org-1');
});

test('malformed API key prefixes fail without database lookup',async()=>{
  let lookups=0;
  const store={async getApiKeyByPrefix(){lookups++;return null;}};
  await assert.rejects(()=>verifyApiKey({store,presentedKey:'Bearer nope',requiredScope:'runs:create',pepper:'pepper'}),error=>error.code==='INVALID_API_KEY');
  assert.equal(lookups,0);
});
