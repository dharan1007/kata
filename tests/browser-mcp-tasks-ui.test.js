import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../extension/popup.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8');

test('extension UI exposes manual task refresh plus separately approved update and cancel flows',()=>{
  for(const id of ['mcp-task','refresh-mcp-task','mcp-task-input-responses','preview-mcp-task-update','mcp-task-update-approval','execute-mcp-task-update','preview-mcp-task-cancel','mcp-task-cancel-approval','execute-mcp-task-cancel'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/never polls in the background/i);
  for(const type of ['get-mcp-task','preview-mcp-task-update','execute-mcp-task-update','preview-mcp-task-cancel','execute-mcp-task-cancel'])assert.match(js,new RegExp(`type:'${type}'`));
  assert.match(js,/taskCreated/);
  assert.match(js,/automaticPolling/);
});
