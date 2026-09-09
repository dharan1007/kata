import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const html=fs.readFileSync(path.join(root,'extension','popup.html'),'utf8');
const scriptPath=path.join(root,'extension','session-popup.js');

test('popup exposes session-only credential setup without any secret reveal control',()=>{
  for(const id of ['session-credential-kind','session-scheme-name','session-secret','session-save-credential','session-credential-list','session-remove-credential','session-clear-credentials'])assert.match(html,new RegExp(`id=["']${id}["']`),`missing ${id}`);
  assert.match(html,/id="session-secret"[^>]*type="password"/);
  assert.doesNotMatch(html,/reveal[^<]*(secret|token|key)/i);
  assert.doesNotMatch(html,/copy[^<]*(secret|token|key)/i);
  assert.match(html,/chrome\.storage\.session|browser session/i);
});

test('popup exposes session task recovery and protected API/MCP action controls',()=>{
  for(const id of ['session-preview-api','session-execute-api','session-list-mcp-tools','session-preview-mcp-tool','session-execute-mcp-tool','session-task-list','session-refresh-task','session-remove-task'])assert.match(html,new RegExp(`id=["']${id}["']`),`missing ${id}`);
  assert.match(html,/src="session-popup\.js"/);
  assert.equal(fs.existsSync(scriptPath),true);
});

test('session popup uses only session controller messages and never persistent storage or secret echo APIs',()=>{
  assert.equal(fs.existsSync(scriptPath),true);
  const source=fs.readFileSync(scriptPath,'utf8');
  assert.match(source,/session-list-credentials/);
  assert.match(source,/session-put-credential/);
  assert.match(source,/session-list-tasks/);
  assert.match(source,/session-preview-api/);
  assert.match(source,/session-list-mcp-tools/);
  for(const forbidden of ['storage.local','storage.sync','navigator.clipboard','document.execCommand','chrome.alarms','setInterval('])assert.equal(source.includes(forbidden),false,`forbidden session popup behavior: ${forbidden}`);
  assert.match(source,/secretInput\.value\s*=\s*['"]["']/,'secret field must be cleared after session storage');
});