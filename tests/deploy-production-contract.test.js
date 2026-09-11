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
  assert.match(workflow,/r\.source\?\.authority!=='vercel-git'/);
  assert.match(workflow,/CANONICAL_URL\/api\/capabilities/);
  assert.match(workflow,/CANONICAL_URL\/api\/openapi/);
  assert.match(workflow,/CANONICAL_URL\/integrity\.json/);
});

test('release and deploy runners require a clean exact checkout before source-bound verification',()=>{
  for(const source of [releaseWorkflow,workflow]){
    assert.match(source,/git rev-parse HEAD/);
    assert.match(source,/git status --porcelain=v1 --untracked-files=all/);
  }
});

test('production verification relies on Vercel Git integration instead of a long-lived deploy token',()=>{
  assert.doesNotMatch(workflow,/VERCEL_TOKEN/);
  assert.doesNotMatch(workflow,/vercel@[^\n]+(?:deploy|pull|build)/);
  assert.match(workflow,/Vercel Git integration/i);
  assert.match(workflow,/Canonical alias did not converge to expected clean source-bound Vercel Git release/);
});

test('production verification allows enough time for provider deployment convergence',()=>{
  assert.match(workflow,/seq 1 120/);
  assert.match(workflow,/sleep 5/);
});

test('production promotion requires release verification evidence, not just a matching commit SHA',()=>{
  assert.match(workflow,/verification\?\.clean!==true/);
  assert.match(workflow,/verification\?\.headMatches!==true/);
});
