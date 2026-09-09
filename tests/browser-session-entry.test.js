import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension','manifest.json'),'utf8'));
const entryPath=path.join(root,'extension','service-worker-entry.js');

test('extension background entry loads existing worker plus isolated session controller runtime',()=>{
  assert.equal(manifest.background?.service_worker,'service-worker-entry.js');
  assert.equal(manifest.background?.type,'module');
  assert.equal(fs.existsSync(entryPath),true);
  const source=fs.readFileSync(entryPath,'utf8');
  assert.match(source,/import\s+['"]\.\/service-worker\.js['"]/);
  assert.match(source,/createSessionController/);
  assert.match(source,/chrome\.storage\.session/);
  assert.match(source,/message\?\.type\?\.startsWith\(['"]session-['"]\)/);
});

test('session entry does not introduce alarms, cookies, debugger or broad background authority',()=>{
  const source=fs.existsSync(entryPath)?fs.readFileSync(entryPath,'utf8'):'';
  for(const forbidden of ['chrome.alarms','chrome.cookies','chrome.debugger','chrome.webRequest','setInterval(','<all_urls>'])assert.equal(source.includes(forbidden),false,`forbidden session runtime behavior: ${forbidden}`);
});