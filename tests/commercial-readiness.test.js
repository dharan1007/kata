import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCommercialReadiness} from '../lib/commercial/readiness.js';

test('commercial readiness fails closed and never exposes secret values',()=>{
  const config={KATA_IDENTITY_CONFIGURED:'',KATA_DATABASE_CONFIGURED:'',KATA_KEY_PEPPER:'super-secret-pepper'};
  const result=evaluateCommercialReadiness({env:config,release:{sourceBound:true,releaseSha:'abc'}});
  assert.equal(result.status,'blocked');
  const byName=Object.fromEntries(result.checks.map(x=>[x.name,x]));
  assert.equal(byName.identity.status,'blocked');
  assert.equal(byName.database.status,'blocked');
  assert.equal(byName.keyPepper.status,'ready');
  assert.equal(byName.billing.status,'blocked');
  assert.equal(byName.legal.status,'blocked');
  assert.doesNotMatch(JSON.stringify(result),/super-secret-pepper/);
});

test('readiness distinguishes implemented from externally configured',()=>{
  const result=evaluateCommercialReadiness({env:{KATA_IDENTITY_CONFIGURED:'true',KATA_DATABASE_CONFIGURED:'true',KATA_KEY_PEPPER:'pepper'},release:{sourceBound:true,releaseSha:'abc'}});
  assert.equal(result.implemented.foundation,true);
  assert.equal(result.status,'blocked');
  assert.ok(result.checks.some(x=>x.status==='blocked'));
});
