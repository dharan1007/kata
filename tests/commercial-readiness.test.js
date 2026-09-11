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

test('boolean configured flags cannot falsely satisfy Vercel identity or database readiness',()=>{
  const env={KATA_IDENTITY_CONFIGURED:'true',KATA_DATABASE_CONFIGURED:'true'};
  const result=evaluateCommercialReadiness({env,release:{sourceBound:true,releaseSha:'abc'}});
  const byName=Object.fromEntries(result.checks.map(x=>[x.name,x]));
  assert.equal(byName.identity.status,'blocked');
  assert.equal(byName.database.status,'blocked');
  assert.equal(result.providers.identity,null);
  assert.equal(result.providers.database,null);
});

test('readiness recognizes concrete OIDC and PostgreSQL provider configuration without exposing endpoints or credentials',()=>{
  const env={
    KATA_IDENTITY_PROVIDER:'oidc',
    KATA_OIDC_USERINFO_URL:'https://identity.example.test/userinfo',
    KATA_DATABASE_PROVIDER:'postgres',
    DATABASE_URL:'postgresql://kata:super-secret-db-password@db.example.test/kata',
    KATA_KEY_PEPPER:'super-secret-pepper'
  };
  const result=evaluateCommercialReadiness({env,release:{sourceBound:true,releaseSha:'abc'}});
  const byName=Object.fromEntries(result.checks.map(x=>[x.name,x]));
  assert.equal(byName.identity.status,'ready');
  assert.equal(byName.database.status,'ready');
  assert.deepEqual(result.providers,{runtime:'vercel',identity:'oidc',database:'postgres'});
  const serialized=JSON.stringify(result);
  assert.doesNotMatch(serialized,/identity\.example\.test/);
  assert.doesNotMatch(serialized,/db\.example\.test/);
  assert.doesNotMatch(serialized,/super-secret-db-password|super-secret-pepper/);
});

test('readiness rejects insecure identity endpoints and non-PostgreSQL database URLs',()=>{
  const env={
    KATA_IDENTITY_PROVIDER:'oidc',
    KATA_OIDC_USERINFO_URL:'http://identity.example.test/userinfo',
    KATA_DATABASE_PROVIDER:'postgres',
    DATABASE_URL:'mysql://db.example.test/kata'
  };
  const result=evaluateCommercialReadiness({env,release:{sourceBound:true,releaseSha:'abc'}});
  const byName=Object.fromEntries(result.checks.map(x=>[x.name,x]));
  assert.equal(byName.identity.status,'blocked');
  assert.equal(byName.database.status,'blocked');
});
