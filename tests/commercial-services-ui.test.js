import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('services surface exposes paid outcomes, intake, SLA and integration onboarding', () => {
  assert.equal(existsSync(new URL('../services.html', import.meta.url)), true, 'services.html must exist');
  assert.equal(existsSync(new URL('../commercial-config.js', import.meta.url)), true, 'commercial-config.js must exist');
  const html = read('services.html');
  for (const text of ['Workflow Audit','Workflow Build','Team Deployment','Start intake','Request invoice','Service SLA','HTTP API','OpenAPI','MCP']) {
    assert.match(html, new RegExp(text, 'i'));
  }
  const config = read('commercial-config.js');
  assert.match(config, /PAYMENT_LINKS/);
  assert.match(config, /INTAKE_URL/);
  assert.match(config, /https:\/\//);
  assert.doesNotMatch(config, /rzp_(live|test)_/i);
  assert.doesNotMatch(config, /secret/i);
  const build = read('scripts/build.mjs');
  assert.match(build, /services\.html/);
  assert.match(build, /commercial-config\.js/);
  const vercel = read('vercel.json');
  assert.match(vercel, /"source":"\/services"/);
  assert.match(vercel, /"destination":"\/services\.html"/);
});
