import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');

test('production deploy smoke validates the actual integrity manifest object shape',()=>{
  assert.match(workflow,/Object\.keys\(i\.assets\?\?\{\}\)\.length\s*<\s*7/);
  assert.doesNotMatch(workflow,/Array\.isArray\(i\.assets\)/);
});

test('production deploy still verifies exact source and canonical API surfaces',()=>{
  assert.match(workflow,/r\.source\?\.sha!==process\.env\.EXPECTED_SHA\.toLowerCase\(\)/);
  assert.match(workflow,/r\.source\?\.provenance!=='source-bound'/);
  assert.match(workflow,/CANONICAL_URL\/api\/capabilities/);
  assert.match(workflow,/CANONICAL_URL\/api\/openapi/);
  assert.match(workflow,/CANONICAL_URL\/integrity\.json/);
});
