import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommercialRouter} from '../lib/commercial/router.js';

const identity={getPrincipal:async()=>null};

test('public pricing is reachable without identity and cannot expose provider identifiers',async()=>{
  const router=createCommercialRouter({store:{},identity,pepper:'pepper',expectedOrigin:'https://kata.example'});
  const response=await router.handle(new Request('https://kata.example/api/pricing'));
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.ok,true);
  assert.equal(payload.plans.find(x=>x.id==='developer').priceInrMonthly,999);
  assert.doesNotMatch(JSON.stringify(payload),/plan_[A-Za-z0-9]+|keySecret|webhookSecret/i);
  assert.match(response.headers.get('cache-control'),/public/);
});

test('commercial readiness implementation map reports shipped control-plane code separately from external configuration',async()=>{
  const router=createCommercialRouter({store:{},identity,pepper:'pepper',expectedOrigin:'https://kata.example',release:{sourceBound:true,releaseSha:'a'.repeat(40)},env:{}});
  const response=await router.handle(new Request('https://kata.example/api/readiness/commercial'));
  const payload=await response.json();
  assert.equal(payload.readiness.implemented.foundation,true);
  assert.equal(payload.readiness.implemented.entitlements,true);
  assert.equal(payload.readiness.implemented.billing,true);
  assert.equal(payload.readiness.implemented.policyCi,true);
  assert.equal(payload.readiness.status,'blocked');
});
