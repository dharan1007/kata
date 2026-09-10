import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
const releaseWorkflow=await readFile(new URL('../.github/workflows/release-gate.yml',import.meta.url),'utf8');

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

test('release and deploy runners require a clean exact checkout before source-bound builds',()=>{
  for(const source of [releaseWorkflow,workflow]){
    assert.match(source,/git rev-parse HEAD/);
    assert.match(source,/git status --porcelain=v1 --untracked-files=all/);
  }
});

test('production promotion rejects provider metadata that explicitly reports a dirty source',()=>{
  assert.match(workflow,/meta\?\.gitDirty/);
  assert.match(workflow,/dirty source/i);
  assert.match(workflow,/api\.vercel\.com\/v13\/deployments/);
});

test('production promotion requires release verification evidence, not just a matching commit SHA',()=>{
  assert.match(workflow,/verification\?\.clean!==true/);
  assert.match(workflow,/verification\?\.headMatches!==true/);
});
