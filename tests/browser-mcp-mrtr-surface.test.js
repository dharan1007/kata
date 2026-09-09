import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8');

test('active-tab MCP UI exposes explicit form-elicitation continuation preview and approval controls',()=>{
  for(const id of ['mcp-continuation','mcp-input-requests','mcp-input-responses','preview-mcp-continuation','mcp-continuation-preview','mcp-continuation-approval','execute-mcp-continuation'])assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(js,/buildMcpInputContinuationPreview/);
  assert.match(js,/fingerprintMcpInputContinuationPreview/);
  assert.match(js,/executeModernMcpToolContinuation/);
  assert.match(js,/input_required/);
  assert.match(js,/continuationSupported/);
  assert.match(js,/Explicit approval is required/i);
});

test('MRTR UI does not add credential collection or automatic continuation',()=>{
  assert.doesNotMatch(html,/bearer token[^<]*(input|textarea)|api key[^<]*(input|textarea)|cookie[^<]*(input|textarea)/i);
  assert.doesNotMatch(js,/setInterval\(|automaticInputFulfillment\s*[:=]\s*true/i);
  assert.match(js,/automaticRetries\s*!==\s*false|automaticRetries/);
});
