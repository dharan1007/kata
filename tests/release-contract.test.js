import test from 'node:test';
import assert from 'node:assert/strict';
import {createReleaseContract,resolveSourceSha,REQUIRED_DEPLOYMENT_ROUTES} from '../scripts/release-contract.mjs';

test('release contract binds to GitHub Actions source identity when available',()=>{
  const sha='A'.repeat(40);
  const contract=createReleaseContract({GITHUB_SHA:sha,GITHUB_REPOSITORY:'dharan1007/kata',GITHUB_REF:'refs/heads/main'});
  assert.equal(contract.source.sha,sha.toLowerCase());
  assert.equal(contract.source.provenance,'source-bound');
  assert.equal(contract.source.authority,'github-actions');
  assert.equal(contract.source.repository,'dharan1007/kata');
  assert.equal(contract.source.ref,'refs/heads/main');
});

test('release contract binds to Vercel Git identity when Git integration supplies the commit',()=>{
  const sha='B'.repeat(40);
  const contract=createReleaseContract({VERCEL_GIT_COMMIT_SHA:sha,VERCEL_GIT_REPO_SLUG:'kata',VERCEL_GIT_REPO_OWNER:'dharan1007',VERCEL_GIT_COMMIT_REF:'main'});
  assert.equal(contract.source.sha,sha.toLowerCase());
  assert.equal(contract.source.provenance,'source-bound');
  assert.equal(contract.source.authority,'vercel-git');
  assert.equal(contract.source.ref,'main');
});

test('manual KATA_SOURCE_SHA is explicit provenance, not provider-bound provenance',()=>{
  const sha='C'.repeat(40);
  const contract=createReleaseContract({KATA_SOURCE_SHA:sha});
  assert.equal(contract.source.sha,sha.toLowerCase());
  assert.equal(contract.source.provenance,'asserted');
  assert.equal(contract.source.authority,'explicit');
});

test('provider source identity outranks a conflicting manual source assertion',()=>{
  const githubSha='D'.repeat(40);
  const assertedSha='E'.repeat(40);
  const contract=createReleaseContract({GITHUB_SHA:githubSha,KATA_SOURCE_SHA:assertedSha});
  assert.equal(contract.source.sha,githubSha.toLowerCase());
  assert.equal(contract.source.provenance,'source-bound');
  assert.equal(contract.source.authority,'github-actions');
});

test('release contract refuses malformed source identity instead of inventing provenance',()=>{
  assert.equal(resolveSourceSha({GITHUB_SHA:'not-a-sha'}),null);
  const contract=createReleaseContract({GITHUB_SHA:'not-a-sha'});
  assert.equal(contract.source.sha,null);
  assert.equal(contract.source.provenance,'unverified');
  assert.equal(contract.source.authority,'none');
});

test('release contract carries the minimum production interoperability route surface',()=>{
  const routes=new Set(REQUIRED_DEPLOYMENT_ROUTES.map(({method,path})=>`${method} ${path}`));
  for(const route of ['GET /','GET /api/health','GET /api/capabilities','GET /api/agents','GET /api/openapi','POST /api/invoke','POST /api/mcp']){
    assert.ok(routes.has(route),`missing ${route}`);
  }
});
