import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
const releaseWorkflow=await readFile(new URL('../.github/workflows/release-gate.yml',import.meta.url),'utf8');

test('production deploy smoke validates the actual integrity manifest object shape',()=>{assert.match(workflow,/Object\.keys\(i\.assets\?\?\{\}\)\.length\s*<\s*7/);assert.doesNotMatch(workflow,/Array\.isArray\(i\.assets\)/);});

test('production candidate verification checks exact source APIs pricing and readiness',()=>{
  assert.match(workflow,/r\.source\?\.sha!==process\.env\.EXPECTED_SHA\.toLowerCase\(\)/);assert.match(workflow,/r\.source\?\.provenance!=='source-bound'/);assert.match(workflow,/r\.source\?\.authority!=='vercel-git'/);assert.match(workflow,/DEPLOYMENT_URL\/api\/capabilities/);assert.match(workflow,/DEPLOYMENT_URL\/api\/openapi/);assert.match(workflow,/DEPLOYMENT_URL\/api\/pricing/);assert.match(workflow,/DEPLOYMENT_URL\/api\/readiness\/commercial/);assert.match(workflow,/DEPLOYMENT_URL\/integrity\.json/);
});

test('GitHub release and production verifier require a clean exact checkout before trusting their own build',()=>{for(const source of [releaseWorkflow,workflow]){assert.match(source,/git rev-parse HEAD/);assert.match(source,/git status --porcelain=v1 --untracked-files=all/);}});

test('production acceptance is a Vercel pre-alias deployment check instead of a post-promotion observer',()=>{
  assert.match(workflow,/repository_dispatch:/);
  assert.match(workflow,/vercel\.deployment\.ready/);
  assert.match(workflow,/github\.event\.client_payload\.url/);
  assert.match(workflow,/github\.event\.client_payload\.git\.sha/);
  assert.match(workflow,/github\.event\.client_payload\.git\.ref/);
  assert.match(workflow,/github\.event\.client_payload\.project\.id/);
  assert.match(workflow,/github\.event\.client_payload\.environment/);
  assert.match(workflow,/vercel\/repository-dispatch\/actions\/status@30f760c6640485cd92f8c785ef361382555fb712/);
  assert.match(workflow,/name:\s*["']?KATA exact-SHA release gate["']?/i);
  assert.doesNotMatch(workflow,/workflow_run:/);
  assert.doesNotMatch(workflow,/Wait for Vercel Git integration and verify canonical exact source/);
});

test('pre-alias deployment check is restricted to the canonical project production main branch',()=>{
  assert.match(workflow,/prj_uDsXCo9uynyfgRGQKxVp9pVGL29y/);
  assert.match(workflow,/github\.event\.client_payload\.environment\s*==\s*'production'/);
  assert.match(workflow,/github\.event\.client_payload\.git\.ref\s*==\s*'main'/);
  assert.match(workflow,/github\.event\.client_payload\.project\.id\s*==\s*'prj_uDsXCo9uynyfgRGQKxVp9pVGL29y'/);
});

test('production verifier uses the deployment URL and exact payload SHA rather than waiting for canonical alias convergence',()=>{
  assert.match(workflow,/DEPLOYMENT_URL:\s*\$\{\{ github\.event\.client_payload\.url \}\}/);
  assert.match(workflow,/EXPECTED_SHA:\s*\$\{\{ github\.event\.client_payload\.git\.sha \}\}/);
  assert.doesNotMatch(workflow,/seq 1 120/);
  assert.doesNotMatch(workflow,/sleep 5/);
});

test('Vercel candidate acceptance requires provider-bound exact-SHA evidence rather than pretending a local Vercel worktree exists',()=>{assert.match(workflow,/verification\?\.providerBound!==true/);assert.match(workflow,/verification\?\.headMatches!==true/);assert.match(workflow,/verification\?\.clean!==null/);});

test('release gate uses the package lock and emits supply-chain evidence',()=>{assert.match(releaseWorkflow,/npm ci --ignore-scripts/);assert.match(releaseWorkflow,/npm audit --audit-level=high/);assert.match(releaseWorkflow,/npm run verify:package/);assert.match(releaseWorkflow,/artifacts\/kata\.spdx\.json/);});
