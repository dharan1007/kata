import test from 'node:test';
import assert from 'node:assert/strict';
import {toolDefinitions} from '../lib/server/tools.js';

const byName=Object.fromEntries(toolDefinitions.map(tool=>[tool.name,tool]));

function annotations(name){
  const value=byName[name]?.annotations;
  assert.ok(value,`${name} must publish MCP tool annotations`);
  assert.equal(Object.hasOwn(value,'untrustedContentHint'),false,`${name} must not publish non-standard untrustedContentHint`);
  return value;
}

test('canonical tools publish standard MCP risk and retry annotations',()=>{
  assert.deepEqual(annotations('kata_search_research'),{
    readOnlyHint:true,
    openWorldHint:true
  });
  assert.deepEqual(annotations('kata_plan_triage'),{
    readOnlyHint:true,
    openWorldHint:true
  });
  assert.deepEqual(annotations('kata_apply_command'),{
    readOnlyHint:false,
    destructiveHint:false,
    idempotentHint:true,
    openWorldHint:false
  });
  assert.deepEqual(annotations('kata_compile_workflow'),{
    readOnlyHint:true,
    openWorldHint:false
  });
  assert.deepEqual(annotations('kata_execute_program'),{
    readOnlyHint:false,
    destructiveHint:false,
    idempotentHint:true,
    openWorldHint:false
  });
  assert.deepEqual(annotations('kata_preview_automation'),{
    readOnlyHint:true,
    openWorldHint:false
  });
  assert.deepEqual(annotations('kata_run_automation'),{
    readOnlyHint:false,
    destructiveHint:false,
    idempotentHint:false,
    openWorldHint:true
  });
});
