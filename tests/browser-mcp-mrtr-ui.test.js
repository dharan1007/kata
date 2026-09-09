import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8');

test('extension UI exposes a separate explicit MCP elicitation preview and approval round',()=>{
  for(const id of ['mcp-input-required','mcp-input-responses','preview-mcp-resume','mcp-resume-approval','execute-mcp-resume'])assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(js,/type:\s*['"]preview-mcp-resume['"]/);
  assert.match(js,/type:\s*['"]execute-mcp-resume['"]/);
  assert.match(js,/continuation/);
  assert.match(js,/inputResponses/);
  assert.match(js,/Explicit approval is required for every resumed MCP round/i);
});
