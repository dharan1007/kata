import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');

test('KATA ships a public workflow-services surface separate from SaaS plans',()=>{
  assert.equal(existsSync('services.html'),true,'services.html must exist');
  const html=read('services.html');
  assert.match(html,/Workflow Audit/);
  assert.match(html,/Workflow Build/);
  assert.match(html,/Team Deployment/);
  assert.match(html,/Customer-specific Integration/i);
  assert.match(html,/https:\/\/tally\.so\/r\/xXAa0J/);
  assert.match(html,/SLA/i);
  assert.match(html,/OpenAPI/i);
  assert.match(html,/MCP/i);
  assert.doesNotMatch(html,/rzp_(?:test|live)_[A-Za-z0-9]+/,'no Razorpay credential may be embedded in public HTML');
});

test('KATA loads a fail-closed commercial CTA from the existing app entrypoint',()=>{
  assert.equal(existsSync('src/commercial-cta.js'),true,'commercial CTA module must exist');
  const entry=read('src/main.js');
  const cta=read('src/commercial-cta.js');
  assert.match(entry,/commercial-cta\.js/);
  assert.match(cta,/\/services/);
  assert.match(cta,/https:\/\/tally\.so\/r\/xXAa0J/);
  assert.match(cta,/https:\/\//,'external checkout URLs must require HTTPS');
  assert.match(cta,/payment/i);
});

test('production build and support contract include commercial services assets and paid SLA semantics',()=>{
  const build=read('scripts/build.mjs');
  const support=read('SUPPORT.md');
  assert.match(build,/services\.html/);
  assert.match(build,/src\/commercial-cta\.js/);
  assert.match(build,/https:\/\/tally\.so\/r\/xXAa0J/);
  assert.match(support,/paid engagement/i);
  assert.match(support,/SLA/i);
  assert.match(support,/payment|invoice/i);
});

test('clean /services URL is routed to the workflow services document',()=>{
  const vercel=read('vercel.json');
  assert.match(vercel,/"source"\s*:\s*"\/services"/);
  assert.match(vercel,/"destination"\s*:\s*"\/services\.html"/);
});
