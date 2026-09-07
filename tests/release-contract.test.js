import test from 'node:test';
import assert from 'node:assert/strict';
import {createReleaseContract,resolveSourceSha,REQUIRED_DEPLOYMENT_ROUTES} from '../scripts/release-contract.mjs';

test('release contract binds to an exact source SHA when available',()=>{
  const sha='A'.repeat(40);
  const contract=createReleaseContract({GITHUB_SHA:sha,GITHUB_REPOSITORY:'dharan1007/kata',GITHUB_REF:'refs/heads/main'});
  assert.equal(contract.source.sha,sha.toLowerCase());
  assert.equal(contract.source.provenance,'source-bound');
  assert.equal(contract.source.repository,'dharan1007/kata');
  assert.equal(contract.source.ref,'refs/heads/main');
});

test('release contract refuses malformed source identity instead of inventing provenance',()=>{
  assert.equal(resolveSourceSha({GITHUB_SHA:'not-a-sha'}),null);
  const contract=createReleaseContract({GITHUB_SHA:'not-a-sha'});
  assert.equal(contract.source.sha,null);
  assert.equal(contract.source.provenance,'unverified');
});

test('release contract carries the minimum production interoperability route surface',()=>{
  const routes=new Set(REQUIRED_DEPLOYMENT_ROUTES.map(({method,path})=>`${method} ${path}`));
  for(const route of ['GET /','GET /api/health','GET /api/capabilities','GET /api/agents','GET /api/openapi','POST /api/invoke','POST /api/mcp']){
    assert.ok(routes.has(route),`missing ${route}`);
  }
});
